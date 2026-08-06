use std::{
    error::Error,
    ffi::OsString,
    os::windows::ffi::OsStringExt,
    slice,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use audio_core::{ring_buffer, Consumer, Producer, SAMPLE_RATE};
use windows::core::{Interface, HSTRING};
use windows::Win32::{
    Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
    Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT},
    Media::Audio::{
        eCapture, eConsole, eRender, IAudioCaptureClient, IAudioClient, IAudioClient3,
        IAudioRenderClient, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
        AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED, AUDCLNT_SHAREMODE_EXCLUSIVE,
        AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
        AUDCLNT_STREAMFLAGS_EVENTCALLBACK, AUDCLNT_STREAMFLAGS_NOPERSIST,
        AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY, DEVICE_STATE_ACTIVE, WAVEFORMATEX,
    },
    System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
        StructuredStorage::PropVariantClear, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
    },
    System::Threading::{CreateEventW, WaitForSingleObject},
    System::Variant::VT_LPWSTR,
};

use super::{
    fill_output, playback_policy_for_output_period, EffectsConfig, InputCallbackStats,
    KaraokeEffects, LiveEffects, PlaybackOutputState, PlaybackStats, RING_SAMPLES,
};

#[derive(Clone, Copy)]
struct DeviceFormat {
    format: WAVEFORMATEX,
    channels: u16,
    bits: u16,
}

impl DeviceFormat {
    fn as_ptr(&self) -> *const WAVEFORMATEX {
        &self.format
    }

    fn label(&self) -> String {
        format!("48000Hz, {}ch, PCM {}-bit", self.channels, self.bits)
    }
}

struct ComGuard;

impl Drop for ComGuard {
    fn drop(&mut self) {
        // SAFETY: this thread successfully initialized COM before creating the guard.
        unsafe { CoUninitialize() };
    }
}

pub struct WasapiStreams {
    stop: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct AudioDeviceCatalog {
    pub inputs: Vec<AudioDeviceInfo>,
    pub outputs: Vec<AudioDeviceInfo>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct AudioDeviceSelection {
    pub input_id: Option<String>,
    pub output_id: Option<String>,
}

impl WasapiStreams {
    pub fn failed(&self) -> bool {
        self.stop.load(Ordering::Acquire)
    }
}

impl Drop for WasapiStreams {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        for handle in self.threads.drain(..) {
            let _ = handle.join();
        }
    }
}

pub fn start(
    effects_config: EffectsConfig,
    live_effects: Arc<LiveEffects>,
    input_stats: InputCallbackStats,
    playback_stats: PlaybackStats,
    selection: AudioDeviceSelection,
) -> Result<(WasapiStreams, Consumer, Producer, Producer), String> {
    let (capture_producer, capture_consumer) = ring_buffer(RING_SAMPLES);
    let (playback_producer, playback_consumer) = ring_buffer(RING_SAMPLES);
    let (mr_producer, mr_consumer) = ring_buffer(RING_SAMPLES);
    let stop = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = mpsc::channel();

    let capture_stop = Arc::clone(&stop);
    let capture_failure_stop = Arc::clone(&stop);
    let capture_ready = ready_tx.clone();
    let capture_device_id = selection.input_id;
    let capture_thread = thread::Builder::new()
        .name("wasapi-shared-capture".into())
        .spawn(move || {
            let result = run_capture(
                capture_stop,
                capture_producer,
                KaraokeEffects::new(effects_config),
                live_effects,
                input_stats,
                capture_device_id.as_deref(),
                &capture_ready,
            );
            if let Err(error) = result {
                capture_failure_stop.store(true, Ordering::Release);
                eprintln!("WASAPI Shared Event-Driven input stopped: {error}");
                let _ = capture_ready.send(Err(format!("input: {error}")));
            }
        })
        .map_err(|error| error.to_string())?;

    let render_stop = Arc::clone(&stop);
    let render_failure_stop = Arc::clone(&stop);
    let render_ready = ready_tx;
    let render_device_id = selection.output_id;
    let render_thread = thread::Builder::new()
        .name("wasapi-exclusive-render".into())
        .spawn(move || {
            let result = run_render(
                render_stop,
                playback_consumer,
                mr_consumer,
                playback_stats,
                render_device_id.as_deref(),
                &render_ready,
            );
            if let Err(error) = result {
                render_failure_stop.store(true, Ordering::Release);
                eprintln!("WASAPI Exclusive Event-Driven output stopped: {error}");
                let _ = render_ready.send(Err(format!("output: {error}")));
            }
        })
        .map_err(|error| error.to_string())?;

    let mut descriptions = Vec::new();
    for _ in 0..2 {
        match ready_rx.recv_timeout(Duration::from_secs(3)) {
            Ok(Ok(description)) => descriptions.push(description),
            Ok(Err(error)) => {
                stop.store(true, Ordering::Release);
                let _ = capture_thread.join();
                let _ = render_thread.join();
                return Err(error);
            }
            Err(error) => {
                stop.store(true, Ordering::Release);
                let _ = capture_thread.join();
                let _ = render_thread.join();
                return Err(format!("initialization timeout: {error}"));
            }
        }
    }
    for description in descriptions {
        println!("{description}");
    }
    Ok((
        WasapiStreams {
            stop,
            threads: vec![capture_thread, render_thread],
        },
        capture_consumer,
        playback_producer,
        mr_producer,
    ))
}

#[allow(clippy::too_many_arguments)]
fn run_capture(
    stop: Arc<AtomicBool>,
    mut producer: Producer,
    mut effects: KaraokeEffects,
    live_effects: Arc<LiveEffects>,
    stats: InputCallbackStats,
    device_id: Option<&str>,
    ready: &mpsc::Sender<Result<String, String>>,
) -> Result<(), String> {
    raise_audio_thread_priority();
    // SAFETY: all WASAPI pointers are owned by this thread and buffers are released per API rules.
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|error| error.to_string())?;
        let _com = ComGuard;
        let (client, format, period_frames, buffer_frames, event, negotiation) =
            open_client_shared(true, device_id)?;
        let capture: IAudioCaptureClient = client.GetService().map_err(|e| e.to_string())?;
        client.Start().map_err(|e| e.to_string())?;
        let _ = ready.send(Ok(format!(
            "Audio input backend: WASAPI Shared Event-Driven ({}, period={:.3}ms, buffer={} frames, {})",
            format.label(),
            frames_to_ms(period_frames),
            buffer_frames,
            negotiation
        )));

        let mut current_config = effects.config;
        while !stop.load(Ordering::Acquire) {
            let next_config = live_effects.snapshot();
            if next_config != current_config {
                effects = KaraokeEffects::new(next_config);
                current_config = next_config;
            }
            if !wait_for_audio_event(event.handle, &stop)? {
                continue;
            }
            let started = Instant::now();
            loop {
                let frames = capture.GetNextPacketSize().map_err(|e| e.to_string())?;
                if frames == 0 {
                    break;
                }
                let mut data = std::ptr::null_mut();
                let mut actual_frames = 0;
                let mut flags = 0;
                capture
                    .GetBuffer(&mut data, &mut actual_frames, &mut flags, None, None)
                    .map_err(|e| e.to_string())?;
                for frame in 0..actual_frames as usize {
                    let mono = if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 {
                        0.0
                    } else {
                        let channels = format.channels as usize;
                        let first_sample = frame * channels;
                        let mut sum = 0.0_f32;
                        for channel in 0..channels {
                            sum += read_sample(data, first_sample + channel);
                        }
                        sum / channels as f32
                    };
                    stats.record_sample(mono);
                    let processed = effects.process_sample(mono);
                    let _ = producer.push(processed);
                }
                capture
                    .ReleaseBuffer(actual_frames)
                    .map_err(|e| e.to_string())?;
                if frames != actual_frames {
                    return Err("capture packet size changed while reading".into());
                }
            }
            stats.record(started.elapsed());
        }
        let _ = client.Stop();
    }
    Ok(())
}

fn run_render(
    stop: Arc<AtomicBool>,
    mut consumer: Consumer,
    mut mr_consumer: Consumer,
    stats: PlaybackStats,
    device_id: Option<&str>,
    ready: &mpsc::Sender<Result<String, String>>,
) -> Result<(), String> {
    raise_audio_thread_priority();
    // SAFETY: all WASAPI pointers are owned by this thread and buffers are released per API rules.
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|error| error.to_string())?;
        let _com = ComGuard;
        let (client, format, period_frames, buffer_frames, event, negotiation) =
            open_client_exclusive_output(device_id)?;
        let playback_policy = playback_policy_for_output_period(period_frames);
        let render: IAudioRenderClient = client.GetService().map_err(|e| e.to_string())?;
        let initial = render.GetBuffer(buffer_frames).map_err(|e| e.to_string())?;
        std::ptr::write_bytes(
            initial,
            0,
            buffer_frames as usize * format.channels as usize * 2,
        );
        render
            .ReleaseBuffer(buffer_frames, AUDCLNT_BUFFERFLAGS_SILENT.0 as u32)
            .map_err(|e| e.to_string())?;
        client.Start().map_err(|e| e.to_string())?;
        let _ = ready.send(Ok(format!(
            "Audio output backend: WASAPI Exclusive Event-Driven ({}, period={:.3}ms, capacity={} frames, queued={} frames, prebuffer={:.3}ms, target={:.3}ms, {})",
            format.label(),
            frames_to_ms(period_frames),
            buffer_frames,
            buffer_frames,
            playback_policy.prebuffer_samples as f64 * 1_000.0 / SAMPLE_RATE as f64,
            playback_policy.target_queue_samples as f64 * 1_000.0 / SAMPLE_RATE as f64,
            negotiation
        )));
        let mut state = PlaybackOutputState::new(false);
        let mut previous_event = None;
        let mut event_intervals_us = Vec::new();
        while !stop.load(Ordering::Acquire) {
            if !wait_for_audio_event(event.handle, &stop)? {
                continue;
            }
            let event_now = Instant::now();
            if let Some(previous) = previous_event.replace(event_now) {
                event_intervals_us.push(event_now.duration_since(previous).as_micros() as u64);
            }
            // Exclusive event-driven rendering hands the application the complete
            // endpoint buffer on every event. Shared-mode padding is not used here.
            let available = buffer_frames;
            let data = render.GetBuffer(available).map_err(|e| e.to_string())?;
            let samples = slice::from_raw_parts_mut(
                data.cast::<i16>(),
                available as usize * format.channels as usize,
            );
            fill_output(
                samples,
                format.channels as usize,
                &mut consumer,
                &mut mr_consumer,
                playback_policy,
                &stats,
                &mut state,
                |value| (value.clamp(-1.0, 1.0) * i16::MAX as f32) as i16,
            );
            render
                .ReleaseBuffer(available, 0)
                .map_err(|e| e.to_string())?;
        }
        let _ = client.Stop();
        print_callback_timing("Exclusive output", period_frames, &mut event_intervals_us);
    }
    Ok(())
}

struct EventHandle {
    handle: HANDLE,
}

impl Drop for EventHandle {
    fn drop(&mut self) {
        // SAFETY: this object solely owns the valid handle returned by CreateEventW.
        unsafe {
            let _ = CloseHandle(self.handle);
        }
    }
}

type OpenedClient = (IAudioClient, DeviceFormat, u32, u32, EventHandle, String);

pub fn enumerate_audio_devices() -> Result<AudioDeviceCatalog, String> {
    thread::spawn(|| unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|error| error.to_string())?;
        let _com = ComGuard;
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        Ok(AudioDeviceCatalog {
            inputs: enumerate_flow(&enumerator, true)?,
            outputs: enumerate_flow(&enumerator, false)?,
        })
    })
    .join()
    .map_err(|_| "audio device enumeration thread panicked".to_owned())?
}

pub fn measure_input_peak(device_id: Option<String>, duration: Duration) -> Result<f32, String> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|error| error.to_string())?;
        let _com = ComGuard;
        let stop = Arc::new(AtomicBool::new(false));
        let (client, format, _, _, event, _) = open_client_shared(true, device_id.as_deref())?;
        let capture: IAudioCaptureClient = client.GetService().map_err(|e| e.to_string())?;
        client.Start().map_err(|e| e.to_string())?;
        let deadline = Instant::now() + duration;
        let mut peak = 0.0_f32;
        while Instant::now() < deadline {
            if !wait_for_audio_event(event.handle, &stop)? {
                continue;
            }
            loop {
                let frames = capture.GetNextPacketSize().map_err(|e| e.to_string())?;
                if frames == 0 {
                    break;
                }
                let mut data = std::ptr::null_mut();
                let mut actual_frames = 0;
                let mut flags = 0;
                capture
                    .GetBuffer(&mut data, &mut actual_frames, &mut flags, None, None)
                    .map_err(|e| e.to_string())?;
                if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 == 0 {
                    for frame in 0..actual_frames as usize {
                        let first = frame * format.channels as usize;
                        let mono = (0..format.channels as usize)
                            .map(|channel| read_sample(data, first + channel))
                            .sum::<f32>()
                            / format.channels as f32;
                        peak = peak.max(mono.abs());
                    }
                }
                capture
                    .ReleaseBuffer(actual_frames)
                    .map_err(|e| e.to_string())?;
            }
        }
        let _ = client.Stop();
        Ok(if peak <= f32::EPSILON {
            -60.0
        } else {
            20.0 * peak.log10()
        })
    }
}

pub fn play_output_test(device_id: Option<String>, duration: Duration) -> Result<(), String> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|error| error.to_string())?;
        let _com = ComGuard;
        let stop = Arc::new(AtomicBool::new(false));
        let (client, format, _, buffer_frames, event, _) =
            open_client_shared(false, device_id.as_deref())?;
        let render: IAudioRenderClient = client.GetService().map_err(|e| e.to_string())?;
        client.Start().map_err(|e| e.to_string())?;
        let started = Instant::now();
        let mut phase = 0.0_f32;
        while started.elapsed() < duration {
            if !wait_for_audio_event(event.handle, &stop)? {
                continue;
            }
            let padding = client.GetCurrentPadding().map_err(|e| e.to_string())?;
            let available = buffer_frames.saturating_sub(padding);
            if available == 0 {
                continue;
            }
            let data = render.GetBuffer(available).map_err(|e| e.to_string())?;
            let samples = slice::from_raw_parts_mut(
                data.cast::<i16>(),
                available as usize * format.channels as usize,
            );
            for frame in samples.chunks_exact_mut(format.channels as usize) {
                let envelope = (1.0 - started.elapsed().as_secs_f32() / duration.as_secs_f32())
                    .clamp(0.0, 1.0);
                let value = (phase.sin() * 0.18 * envelope * i16::MAX as f32) as i16;
                frame.fill(value);
                phase += std::f32::consts::TAU * 440.0 / SAMPLE_RATE as f32;
                if phase >= std::f32::consts::TAU {
                    phase -= std::f32::consts::TAU;
                }
            }
            render
                .ReleaseBuffer(available, 0)
                .map_err(|e| e.to_string())?;
        }
        let _ = client.Stop();
        Ok(())
    }
}

unsafe fn enumerate_flow(
    enumerator: &IMMDeviceEnumerator,
    input: bool,
) -> Result<Vec<AudioDeviceInfo>, String> {
    let flow = if input { eCapture } else { eRender };
    let default_id = enumerator
        .GetDefaultAudioEndpoint(flow, eConsole)
        .ok()
        .and_then(|device| endpoint_id(&device).ok());
    let collection = enumerator
        .EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)
        .map_err(|error| error.to_string())?;
    let mut devices =
        Vec::with_capacity(collection.GetCount().map_err(|e| e.to_string())? as usize);
    for index in 0..collection.GetCount().map_err(|e| e.to_string())? {
        let device = collection.Item(index).map_err(|e| e.to_string())?;
        let id = endpoint_id(&device)?;
        let name = endpoint_friendly_name(&device).unwrap_or_else(|_| id.clone());
        devices.push(AudioDeviceInfo {
            is_default: default_id.as_deref() == Some(id.as_str()),
            id,
            name,
        });
    }
    devices.sort_by_key(|device| (!device.is_default, device.name.to_lowercase()));
    Ok(devices)
}

unsafe fn select_endpoint(
    enumerator: &IMMDeviceEnumerator,
    input: bool,
    device_id: Option<&str>,
) -> Result<IMMDevice, String> {
    if let Some(device_id) = device_id.filter(|value| !value.is_empty()) {
        enumerator
            .GetDevice(&HSTRING::from(device_id))
            .map_err(|error| format!("selected audio device is unavailable: {error}"))
    } else {
        enumerator
            .GetDefaultAudioEndpoint(if input { eCapture } else { eRender }, eConsole)
            .map_err(|error| error.to_string())
    }
}

unsafe fn endpoint_id(device: &IMMDevice) -> Result<String, String> {
    let id = device.GetId().map_err(|error| error.to_string())?;
    let result = id.to_string().map_err(|error| error.to_string());
    CoTaskMemFree(Some(id.0.cast()));
    result
}

unsafe fn endpoint_friendly_name(device: &IMMDevice) -> Result<String, String> {
    let store = device
        .OpenPropertyStore(STGM_READ)
        .map_err(|error| error.to_string())?;
    let mut value = store
        .GetValue(&PKEY_Device_FriendlyName)
        .map_err(|error| error.to_string())?;
    let raw = &value.as_raw().Anonymous.Anonymous;
    if raw.vt != VT_LPWSTR.0 {
        let _ = PropVariantClear(&mut value);
        return Err("audio endpoint friendly name has an unexpected type".into());
    }
    let pointer = *(&raw.Anonymous as *const _ as *const *const u16);
    let mut length = 0_isize;
    while *pointer.offset(length) != 0 {
        length += 1;
    }
    let name = OsString::from_wide(slice::from_raw_parts(pointer, length as usize))
        .to_string_lossy()
        .into_owned();
    let _ = PropVariantClear(&mut value);
    Ok(name)
}

// Capture stays in Shared Event-Driven mode so Windows can perform endpoint
// conversion. Prefer the minimum IAudioClient3 engine period, then fall back to
// the legacy Shared initializer when low-latency negotiation is unavailable.
unsafe fn open_client_shared(input: bool, device_id: Option<&str>) -> Result<OpenedClient, String> {
    const SHARED_BUFFER_DURATION_100NS: i64 = 100_000; // 10 ms
    let enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
    let device = select_endpoint(&enumerator, input, device_id)?;
    let format = basic(if input { 1 } else { 2 }, 16);
    let low_latency_flags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
    let fallback_flags = shared_fallback_stream_flags();

    let low_latency_client: IAudioClient = device
        .Activate(CLSCTX_ALL, None)
        .map_err(|e| e.to_string())?;
    let low_latency_result = low_latency_client
        .cast::<IAudioClient3>()
        .map_err(|e| e.to_string())
        .and_then(|client3| initialize_low_latency(&client3, &format, low_latency_flags));

    let (client, period_frames, negotiation) = match low_latency_result {
        Ok((period_frames, limits)) => (
            low_latency_client,
            period_frames,
            format!("IAudioClient3 minimum-period; {limits}"),
        ),
        Err(low_latency_error) => {
            let fallback: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| e.to_string())?;
            fallback
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    fallback_flags,
                    SHARED_BUFFER_DURATION_100NS,
                    0,
                    format.as_ptr(),
                    None,
                )
                .map_err(|e| {
                    format!(
                        "Shared fallback Initialize at 10ms failed: {e}; low-latency attempt: {low_latency_error}"
                    )
                })?;
            let mut period_100ns = 0;
            fallback
                .GetDevicePeriod(Some(&mut period_100ns), None)
                .map_err(|e| e.to_string())?;
            let fallback_frames = ((i128::from(period_100ns) * i128::from(SAMPLE_RATE) + 9_999_999)
                / 10_000_000) as u32;
            (
                fallback,
                fallback_frames,
                format!("legacy Shared fallback; low-latency attempt: {low_latency_error}"),
            )
        }
    };

    finish_open_client(client, format, period_frames, negotiation)
}

unsafe fn open_client_exclusive_output(device_id: Option<&str>) -> Result<OpenedClient, String> {
    let enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
    let device = select_endpoint(&enumerator, false, device_id)?;
    let format = basic(2, 16);
    let probe: IAudioClient = device
        .Activate(CLSCTX_ALL, None)
        .map_err(|e| e.to_string())?;
    probe
        .IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE, format.as_ptr(), None)
        .ok()
        .map_err(|e| format!("Exclusive format {} is unsupported: {e}", format.label()))?;

    let mut default_period_100ns = 0;
    let mut minimum_period_100ns = 0;
    probe
        .GetDevicePeriod(
            Some(&mut default_period_100ns),
            Some(&mut minimum_period_100ns),
        )
        .map_err(|e| e.to_string())?;
    let requested_period_100ns = minimum_period_100ns;
    let requested_frames = period_100ns_to_frames(requested_period_100ns);
    let flags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK;

    let mut client = probe;
    let mut selected_period_100ns = requested_period_100ns;
    let mut selected_frames = requested_frames;
    let mut alignment_note = String::new();
    if let Err(error) = client.Initialize(
        AUDCLNT_SHAREMODE_EXCLUSIVE,
        flags,
        selected_period_100ns,
        selected_period_100ns,
        format.as_ptr(),
        None,
    ) {
        if error.code() != AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED {
            return Err(format!(
                "Exclusive Initialize at {} frames ({:.3}ms) failed: {error}",
                selected_frames,
                frames_to_ms(selected_frames)
            ));
        }
        selected_frames = client
            .GetBufferSize()
            .map_err(|e| format!("Exclusive alignment query after {error} failed: {e}"))?;
        selected_period_100ns = frames_to_period_100ns(selected_frames);
        alignment_note = format!(", driver-aligned from {requested_frames} frames");
        client = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| e.to_string())?;
        client
            .Initialize(
                AUDCLNT_SHAREMODE_EXCLUSIVE,
                flags,
                selected_period_100ns,
                selected_period_100ns,
                format.as_ptr(),
                None,
            )
            .map_err(|e| {
                format!(
                    "Exclusive aligned Initialize at {} frames ({:.3}ms) failed: {e}",
                    selected_frames,
                    frames_to_ms(selected_frames)
                )
            })?;
    }

    let stream_latency_100ns = client.GetStreamLatency().map_err(|e| e.to_string())?;
    finish_open_client(
        client,
        format,
        selected_frames,
        format!(
            "requested minimum={requested_frames} frames, selected={selected_frames} frames{alignment_note}, WASAPI stream latency={:.3}ms",
            stream_latency_100ns as f64 / 10_000.0
        ),
    )
}

unsafe fn initialize_low_latency(
    client: &IAudioClient3,
    format: &DeviceFormat,
    flags: u32,
) -> Result<(u32, String), String> {
    let mut default_frames = 0;
    let mut fundamental_frames = 0;
    let mut minimum_frames = 0;
    let mut maximum_frames = 0;
    client
        .GetSharedModeEnginePeriod(
            format.as_ptr(),
            &mut default_frames,
            &mut fundamental_frames,
            &mut minimum_frames,
            &mut maximum_frames,
        )
        .map_err(|e| format!("GetSharedModeEnginePeriod: {e}"))?;
    let selected_frames =
        select_minimum_period(minimum_frames, maximum_frames, fundamental_frames)?;
    client
        .InitializeSharedAudioStream(flags, selected_frames, format.as_ptr(), None)
        .map_err(|e| {
            format!(
                "InitializeSharedAudioStream at {} frames ({:.3}ms): {e}",
                selected_frames,
                frames_to_ms(selected_frames)
            )
        })?;
    Ok((
        selected_frames,
        format!(
            "selected={} frames, supported min/fundamental/default/max={}/{}/{}/{}",
            selected_frames, minimum_frames, fundamental_frames, default_frames, maximum_frames
        ),
    ))
}

unsafe fn finish_open_client(
    client: IAudioClient,
    format: DeviceFormat,
    period_frames: u32,
    negotiation: String,
) -> Result<OpenedClient, String> {
    let event = EventHandle {
        handle: CreateEventW(None, false, false, None).map_err(|e| e.to_string())?,
    };
    client
        .SetEventHandle(event.handle)
        .map_err(|e| e.to_string())?;
    let buffer_frames = client.GetBufferSize().map_err(|e| e.to_string())?;
    Ok((
        client,
        format,
        period_frames,
        buffer_frames,
        event,
        negotiation,
    ))
}

fn shared_fallback_stream_flags() -> u32 {
    AUDCLNT_STREAMFLAGS_EVENTCALLBACK
        | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
        | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY
        | AUDCLNT_STREAMFLAGS_NOPERSIST
}

fn select_minimum_period(minimum: u32, maximum: u32, fundamental: u32) -> Result<u32, String> {
    if minimum == 0 || maximum < minimum || fundamental == 0 {
        return Err(format!(
            "invalid engine period range: min={minimum}, max={maximum}, fundamental={fundamental}"
        ));
    }
    Ok(minimum)
}

fn frames_to_ms(frames: u32) -> f64 {
    f64::from(frames) * 1_000.0 / f64::from(SAMPLE_RATE)
}

fn period_100ns_to_frames(period_100ns: i64) -> u32 {
    ((i128::from(period_100ns) * i128::from(SAMPLE_RATE) + 9_999_999) / 10_000_000) as u32
}

fn frames_to_period_100ns(frames: u32) -> i64 {
    ((i128::from(frames) * 10_000_000 + i128::from(SAMPLE_RATE) - 1) / i128::from(SAMPLE_RATE))
        as i64
}

fn print_callback_timing(label: &str, period_frames: u32, intervals_us: &mut [u64]) {
    if intervals_us.is_empty() {
        println!("{label} callback timing: no intervals recorded");
        return;
    }
    intervals_us.sort_unstable();
    let percentile = |percent: usize| {
        let index = ((intervals_us.len() - 1) * percent) / 100;
        intervals_us[index] as f64 / 1_000.0
    };
    let expected_ms = frames_to_ms(period_frames);
    let late_threshold_us = (expected_ms * 1_500.0) as u64;
    let late = intervals_us
        .iter()
        .filter(|&&interval| interval > late_threshold_us)
        .count();
    println!(
        "{label} callback timing: expected={expected_ms:.3}ms, p50={:.3}ms, p95={:.3}ms, p99={:.3}ms, max={:.3}ms, late_over_1.5x={late}/{}, intervals={}",
        percentile(50),
        percentile(95),
        percentile(99),
        intervals_us[intervals_us.len() - 1] as f64 / 1_000.0,
        intervals_us.len(),
        intervals_us.len()
    );
}

fn wait_for_audio_event(handle: HANDLE, _stop: &AtomicBool) -> Result<bool, String> {
    // The bounded timeout lets Drop stop and join the audio threads even when a
    // device disappears without signalling its event.
    let result = unsafe { WaitForSingleObject(handle, 100) };
    if result == WAIT_OBJECT_0 {
        Ok(true)
    } else if result == WAIT_TIMEOUT {
        Ok(false)
    } else {
        Err(format!("audio event wait failed: {}", result.0))
    }
}

fn basic(channels: u16, bits: u16) -> DeviceFormat {
    let block_align = channels * (bits / 8);
    DeviceFormat {
        format: WAVEFORMATEX {
            wFormatTag: 1,
            nChannels: channels,
            nSamplesPerSec: SAMPLE_RATE,
            nAvgBytesPerSec: SAMPLE_RATE * u32::from(block_align),
            nBlockAlign: block_align,
            wBitsPerSample: bits,
            cbSize: 0,
        },
        channels,
        bits,
    }
}

unsafe fn read_sample(data: *const u8, sample: usize) -> f32 {
    *data.cast::<i16>().add(sample) as f32 / i16::MAX as f32
}

fn raise_audio_thread_priority() {
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_HIGHEST,
    };
    // SAFETY: GetCurrentThread returns a valid pseudo-handle for the current thread.
    unsafe {
        let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
    }
}

#[allow(dead_code)]
pub fn probe_default_devices() -> Result<(), Box<dyn Error>> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
        let _com = ComGuard;
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        println!("WASAPI Shared-input/Exclusive-output capability probe (default devices)");
        for (input, label) in [(true, "Input"), (false, "Output")] {
            let device = enumerator
                .GetDefaultAudioEndpoint(if input { eCapture } else { eRender }, eConsole)?;
            let client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
            let mix = client.GetMixFormat()?;
            let sample_rate = (*mix).nSamplesPerSec;
            let mix_channels = (*mix).nChannels;
            let mix_bits = (*mix).wBitsPerSample;
            let mix_tag = (*mix).wFormatTag;
            let mut default_period = 0;
            let mut minimum_period = 0;
            client.GetDevicePeriod(Some(&mut default_period), Some(&mut minimum_period))?;
            println!("{label} endpoint:");
            println!(
                "  shared mix format: {sample_rate}Hz, {mix_channels}ch, tag=0x{mix_tag:04x}, {mix_bits}-bit"
            );
            println!(
                "  device period: default={:.3}ms, minimum={:.3}ms",
                default_period as f64 / 10_000.0,
                minimum_period as f64 / 10_000.0
            );
            println!("  application format: 48000Hz PCM 16-bit (engine converted)");
            let application_format = basic(if input { 1 } else { 2 }, 16);
            match client.cast::<IAudioClient3>() {
                Ok(client3) => {
                    let mut default_frames = 0;
                    let mut fundamental_frames = 0;
                    let mut minimum_frames = 0;
                    let mut maximum_frames = 0;
                    match client3.GetSharedModeEnginePeriod(
                        application_format.as_ptr(),
                        &mut default_frames,
                        &mut fundamental_frames,
                        &mut minimum_frames,
                        &mut maximum_frames,
                    ) {
                        Ok(()) => {
                            let selected = select_minimum_period(
                                minimum_frames,
                                maximum_frames,
                                fundamental_frames,
                            )?;
                            println!(
                                "  low-latency periods: min/fundamental/default/max={minimum_frames}/{fundamental_frames}/{default_frames}/{maximum_frames} frames"
                            );
                            println!(
                                "  selected minimum period: {selected} frames ({:.3}ms)",
                                frames_to_ms(selected)
                            );
                        }
                        Err(error) => println!("  low-latency period query unavailable: {error}"),
                    }
                    let mut mix_default = 0;
                    let mut mix_fundamental = 0;
                    let mut mix_minimum = 0;
                    let mut mix_maximum = 0;
                    match client3.GetSharedModeEnginePeriod(
                        mix,
                        &mut mix_default,
                        &mut mix_fundamental,
                        &mut mix_minimum,
                        &mut mix_maximum,
                    ) {
                        Ok(()) => println!(
                            "  native mix periods: min/fundamental/default/max={mix_minimum}/{mix_fundamental}/{mix_default}/{mix_maximum} frames"
                        ),
                        Err(error) => println!("  native mix period query unavailable: {error}"),
                    }
                }
                Err(error) => println!("  IAudioClient3 unavailable: {error}"),
            }
            CoTaskMemFree(Some(mix.cast()));
        }
        println!("WASAPI probe completed");
    }
    Ok(())
}

#[cfg(test)]
mod period_tests {
    use super::select_minimum_period;

    #[test]
    fn selects_minimum_supported_period() {
        assert_eq!(select_minimum_period(120, 480, 120).unwrap(), 120);
    }

    #[test]
    fn rejects_invalid_period_limits() {
        assert!(select_minimum_period(0, 480, 120).is_err());
        assert!(select_minimum_period(240, 120, 120).is_err());
        assert!(select_minimum_period(120, 480, 0).is_err());
    }
}
