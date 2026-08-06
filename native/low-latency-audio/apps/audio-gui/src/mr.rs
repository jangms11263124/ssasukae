use reqwest::blocking::Client;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::mpsc::Sender,
    thread,
    time::{Duration, SystemTime},
};
use symphonia::core::{
    audio::SampleBuffer, codecs::DecoderOptions, errors::Error as SymphoniaError,
    formats::FormatOptions, io::MediaSourceStream, meta::MetadataOptions, probe::Hint,
};

const TARGET_SAMPLE_RATE: u32 = 48_000;
const MAX_MR_BYTES: usize = 100 * 1024 * 1024;
const MAX_CACHE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_CACHE_AGE: Duration = Duration::from_secs(14 * 24 * 60 * 60);

pub enum MrEvent {
    Ready {
        performance_id: u64,
        samples: Vec<f32>,
        cache_hit: bool,
    },
    Failed {
        performance_id: u64,
        message: String,
    },
}

pub fn download(performance_id: u64, song_id: u64, url: String, event_tx: Sender<MrEvent>) {
    thread::spawn(move || {
        let result = load_or_download_and_decode(song_id, &url);
        let event = match result {
            Ok((samples, cache_hit)) => MrEvent::Ready {
                performance_id,
                samples,
                cache_hit,
            },
            Err(message) => MrEvent::Failed {
                performance_id,
                message,
            },
        };
        let _ = event_tx.send(event);
    });
}

fn load_or_download_and_decode(song_id: u64, url: &str) -> Result<(Vec<f32>, bool), String> {
    let cache = cache_paths(song_id);
    let _ = fs::create_dir_all(&cache.directory);
    cleanup_cache(&cache.directory);
    if let Some(bytes) = read_cache(&cache, url) {
        if let Ok(samples) = decode_audio(bytes, url) {
            return Ok((samples, true));
        }
        let _ = fs::remove_file(&cache.audio);
        let _ = fs::remove_file(&cache.metadata);
    }

    let bytes = download_bytes(url)?;
    let samples = decode_audio(bytes.clone(), url)?;
    let _ = write_cache(&cache, url, &bytes);
    Ok((samples, false))
}

fn download_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|error| format!("MR 다운로드 클라이언트 생성 실패: {error}"))?;
    let response = client
        .get(url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|error| format!("MR 다운로드 실패: {error}"))?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_MR_BYTES as u64)
    {
        return Err("MR 파일이 허용 크기(100MB)를 초과합니다".into());
    }
    let bytes = response
        .bytes()
        .map_err(|error| format!("MR 다운로드 본문 읽기 실패: {error}"))?;
    if bytes.len() > MAX_MR_BYTES {
        return Err("MR 파일이 허용 크기(100MB)를 초과합니다".into());
    }
    Ok(bytes.to_vec())
}

struct CachePaths {
    directory: PathBuf,
    audio: PathBuf,
    metadata: PathBuf,
}

fn cache_paths(song_id: u64) -> CachePaths {
    let directory = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("SSAFYStar")
        .join("mr-cache");
    CachePaths {
        audio: directory.join(format!("song-{song_id}.audio")),
        metadata: directory.join(format!("song-{song_id}.meta")),
        directory,
    }
}

fn canonical_asset_url(url: &str) -> &str {
    url.split('?').next().unwrap_or(url)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn read_cache(paths: &CachePaths, url: &str) -> Option<Vec<u8>> {
    let metadata = fs::read_to_string(&paths.metadata).ok()?;
    let mut lines = metadata.lines();
    if lines.next()? != canonical_asset_url(url) {
        return None;
    }
    let expected_hash = lines.next()?;
    let bytes = fs::read(&paths.audio).ok()?;
    if bytes.is_empty() || bytes.len() > MAX_MR_BYTES || sha256_hex(&bytes) != expected_hash {
        return None;
    }
    Some(bytes)
}

fn write_cache(paths: &CachePaths, url: &str, bytes: &[u8]) -> Result<(), String> {
    fs::create_dir_all(&paths.directory)
        .map_err(|error| format!("MR 캐시 폴더 생성 실패: {error}"))?;
    let suffix = std::process::id();
    let audio_temp = paths.directory.join(format!(".mr-{suffix}.audio.tmp"));
    let metadata_temp = paths.directory.join(format!(".mr-{suffix}.meta.tmp"));
    fs::write(&audio_temp, bytes).map_err(|error| format!("MR 캐시 저장 실패: {error}"))?;
    let metadata = format!(
        "{}\n{}\n{}\n",
        canonical_asset_url(url),
        sha256_hex(bytes),
        bytes.len()
    );
    fs::write(&metadata_temp, metadata)
        .map_err(|error| format!("MR 캐시 정보 저장 실패: {error}"))?;
    let _ = fs::remove_file(&paths.audio);
    let _ = fs::remove_file(&paths.metadata);
    fs::rename(&audio_temp, &paths.audio).map_err(|error| format!("MR 캐시 적용 실패: {error}"))?;
    fs::rename(&metadata_temp, &paths.metadata)
        .map_err(|error| format!("MR 캐시 정보 적용 실패: {error}"))?;
    Ok(())
}

fn cleanup_cache(directory: &Path) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let now = SystemTime::now();
    let mut audio_files = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        if now
            .duration_since(modified)
            .is_ok_and(|age| age > MAX_CACHE_AGE)
        {
            let _ = fs::remove_file(&path);
            continue;
        }
        if path
            .extension()
            .is_some_and(|extension| extension == "audio")
        {
            audio_files.push((path, modified, metadata.len()));
        }
    }
    audio_files.sort_by_key(|(_, modified, _)| *modified);
    let mut total: u64 = audio_files.iter().map(|(_, _, size)| *size).sum();
    for (audio, _, size) in audio_files {
        if total <= MAX_CACHE_BYTES {
            break;
        }
        let metadata = audio.with_extension("meta");
        let _ = fs::remove_file(audio);
        let _ = fs::remove_file(metadata);
        total = total.saturating_sub(size);
    }
}

fn decode_audio(bytes: Vec<u8>, source_url: &str) -> Result<Vec<f32>, String> {
    let mut hint = Hint::new();
    if let Some(extension) = source_url
        .split('?')
        .next()
        .and_then(|path| path.rsplit('.').next())
    {
        hint.with_extension(extension);
    }
    let source = MediaSourceStream::new(Box::new(Cursor::new(bytes)), Default::default());
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| format!("MR 형식 확인 실패: {error}"))?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| "MR에 재생 가능한 오디오 트랙이 없습니다".to_owned())?;
    let track_id = track.id;
    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| "MR 샘플레이트를 확인할 수 없습니다".to_owned())?;
    let codec_params = track.codec_params.clone();
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|error| format!("MR 디코더 생성 실패: {error}"))?;
    let mut mono = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(error) => return Err(format!("MR 패킷 읽기 실패: {error}")),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(error) => return Err(format!("MR 디코딩 실패: {error}")),
        };
        let channels = decoded.spec().channels.count();
        if channels == 0 {
            continue;
        }
        let mut samples = SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
        samples.copy_interleaved_ref(decoded);
        for frame in samples.samples().chunks_exact(channels) {
            mono.push(frame.iter().copied().sum::<f32>() / channels as f32);
        }
    }
    if mono.is_empty() {
        return Err("MR에서 오디오 샘플을 읽지 못했습니다".into());
    }
    Ok(resample_linear(&mono, sample_rate, TARGET_SAMPLE_RATE))
}

fn resample_linear(input: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if source_rate == target_rate || input.len() < 2 {
        return input.to_vec();
    }
    let output_len = input.len() * target_rate as usize / source_rate as usize;
    let ratio = source_rate as f64 / target_rate as f64;
    (0..output_len)
        .map(|index| {
            let position = index as f64 * ratio;
            let left = position.floor() as usize;
            let fraction = (position - left as f64) as f32;
            let a = input[left.min(input.len() - 1)];
            let b = input[(left + 1).min(input.len() - 1)];
            a + (b - a) * fraction
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linear_resampler_changes_sample_count() {
        let source = vec![0.0; 44_100];
        assert_eq!(resample_linear(&source, 44_100, 48_000).len(), 48_000);
    }

    #[test]
    fn mock_spring_mr_decodes_to_three_seconds_of_48khz_mono() {
        let samples = decode_audio(crate::backend::mock_wav(), "http://mock/mr.wav")
            .expect("mock MR should decode");
        assert_eq!(samples.len(), 48_000 * 3);
        assert!(samples.iter().any(|sample| sample.abs() > 0.01));
    }

    #[test]
    fn cache_rejects_corrupted_audio() {
        let directory = std::env::temp_dir().join(format!(
            "ssafystar-mr-cache-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let paths = CachePaths {
            audio: directory.join("song-7.audio"),
            metadata: directory.join("song-7.meta"),
            directory: directory.clone(),
        };
        let original = crate::backend::mock_wav();
        write_cache(&paths, "https://example.test/song-7.wav?token=a", &original)
            .expect("cache write");
        assert_eq!(
            read_cache(&paths, "https://example.test/song-7.wav?token=b"),
            Some(original)
        );
        fs::write(&paths.audio, b"corrupt").expect("corrupt cache");
        assert!(read_cache(&paths, "https://example.test/song-7.wav").is_none());
        let _ = fs::remove_dir_all(directory);
    }
}
