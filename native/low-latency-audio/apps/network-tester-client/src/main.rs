use metrics::{packet_loss, summarize, SequenceTracker};
use protocol::{
    decode, encode, PacketHeader, PacketKind, DEFAULT_PACKET_BYTES, HEADER_LEN, MAX_PACKET_BYTES,
};
use std::{
    env,
    fs::{self, File},
    io::{self, BufWriter, Write},
    net::UdpSocket,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

struct Config {
    server: String,
    duration: Duration,
    interval: Duration,
    packet_bytes: usize,
    output: PathBuf,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    if env::args().any(|arg| arg == "--help" || arg == "-h") {
        print_help();
        return Ok(());
    }
    let config = Config::parse()?;
    if let Some(parent) = config.output.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    let mut csv = BufWriter::new(File::create(&config.output)?);
    writeln!(csv, "sequence,client_sent_ns,server_received_ns,server_sent_ns,client_received_ns,rtt_us,server_processing_us,inter_arrival_us,jitter_us")?;

    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.connect(&config.server)?;
    socket.set_nonblocking(true)?;
    let running = Arc::new(AtomicBool::new(true));
    let signal = Arc::clone(&running);
    ctrlc::set_handler(move || signal.store(false, Ordering::SeqCst))?;

    let epoch = Instant::now();
    let deadline = epoch + config.duration;
    let mut next_send = epoch;
    let mut sequence = 0_u64;
    let mut sent = 0_u64;
    let mut deadline_misses = 0_u64;
    let mut tracker = SequenceTracker::default();
    let mut rtts = Vec::new();
    let mut jitters = Vec::new();
    let mut inter_arrivals = Vec::new();
    let mut previous_rtt: Option<f64> = None;
    let mut previous_arrival: Option<u64> = None;
    let mut buffer = vec![0_u8; MAX_PACKET_BYTES];
    println!(
        "Testing {} every {:.3} ms for {:.1} s; press Ctrl+C to stop",
        config.server,
        config.interval.as_secs_f64() * 1000.0,
        config.duration.as_secs_f64()
    );

    while running.load(Ordering::Relaxed) && Instant::now() < deadline {
        let now = Instant::now();
        if now >= next_send {
            let missed_deadline = now.duration_since(next_send) >= config.interval;
            if missed_deadline {
                deadline_misses += 1;
            }
            let sent_ns = elapsed_ns(epoch);
            let packet = encode(
                PacketHeader {
                    kind: PacketKind::Ping,
                    sequence,
                    client_sent_ns: sent_ns,
                    server_received_ns: 0,
                    server_sent_ns: 0,
                    session_id: 0,
                    client_id: 0,
                },
                config.packet_bytes,
            )?;
            socket.send(&packet)?;
            sent += 1;
            sequence = sequence.wrapping_add(1);
            next_send = if missed_deadline {
                now + config.interval
            } else {
                next_send + config.interval
            };
        }
        receive_available(
            &socket,
            &mut buffer,
            epoch,
            &mut tracker,
            &mut rtts,
            &mut jitters,
            &mut inter_arrivals,
            &mut previous_rtt,
            &mut previous_arrival,
            &mut csv,
        )?;
        // Poll replies frequently so receive scheduling does not add up to one
        // full packet interval to the measured RTT.
        let receive_poll = Instant::now() + Duration::from_micros(100);
        wait_until(next_send.min(deadline).min(receive_poll));
    }

    let measured_duration = epoch.elapsed();
    // Allow late replies to arrive without extending an interrupted test excessively.
    let grace_deadline = Instant::now() + Duration::from_secs(1);
    while running.load(Ordering::Relaxed) && Instant::now() < grace_deadline {
        receive_available(
            &socket,
            &mut buffer,
            epoch,
            &mut tracker,
            &mut rtts,
            &mut jitters,
            &mut inter_arrivals,
            &mut previous_rtt,
            &mut previous_arrival,
            &mut csv,
        )?;
        thread::sleep(Duration::from_millis(2));
    }
    csv.flush()?;
    report(Report {
        duration: measured_duration,
        sent,
        tracker: &tracker,
        misses: deadline_misses,
        rtts: &rtts,
        jitters: &jitters,
        inter_arrivals: &inter_arrivals,
        output: &config.output,
    });
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn receive_available(
    socket: &UdpSocket,
    buffer: &mut [u8],
    epoch: Instant,
    tracker: &mut SequenceTracker,
    rtts: &mut Vec<f64>,
    jitters: &mut Vec<f64>,
    inter_arrivals: &mut Vec<f64>,
    previous_rtt: &mut Option<f64>,
    previous_arrival: &mut Option<u64>,
    csv: &mut impl Write,
) -> io::Result<()> {
    loop {
        match socket.recv(buffer) {
            Ok(size) => {
                let received_ns = elapsed_ns(epoch);
                let Ok(packet) = decode(&buffer[..size]) else {
                    continue;
                };
                if packet.kind != PacketKind::Pong {
                    continue;
                }
                if !tracker.observe(packet.sequence) {
                    continue;
                }
                let rtt_us = received_ns.saturating_sub(packet.client_sent_ns) as f64 / 1_000.0;
                let processing_us = packet
                    .server_sent_ns
                    .saturating_sub(packet.server_received_ns)
                    as f64
                    / 1_000.0;
                let inter_us =
                    previous_arrival.map(|last| received_ns.saturating_sub(last) as f64 / 1_000.0);
                let jitter_us = previous_rtt.map(|last| (rtt_us - last).abs());
                if let Some(value) = inter_us {
                    inter_arrivals.push(value);
                }
                if let Some(value) = jitter_us {
                    jitters.push(value);
                }
                rtts.push(rtt_us);
                *previous_rtt = Some(rtt_us);
                *previous_arrival = Some(received_ns);
                writeln!(
                    csv,
                    "{},{},{},{},{},{:.3},{:.3},{},{}",
                    packet.sequence,
                    packet.client_sent_ns,
                    packet.server_received_ns,
                    packet.server_sent_ns,
                    received_ns,
                    rtt_us,
                    processing_us,
                    optional(inter_us),
                    optional(jitter_us)
                )?;
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => return Ok(()),
            Err(error) => return Err(error),
        }
    }
}

struct Report<'a> {
    duration: Duration,
    sent: u64,
    tracker: &'a SequenceTracker,
    misses: u64,
    rtts: &'a [f64],
    jitters: &'a [f64],
    inter_arrivals: &'a [f64],
    output: &'a Path,
}

fn report(report: Report<'_>) {
    let (lost, loss_rate) = packet_loss(report.sent, report.tracker.unique_received());
    println!("\nTest completed\nDuration: {:.2}s\nPackets sent: {}\nPackets received: {}\nPackets lost: {lost}\nPacket loss: {loss_rate:.4}%\nDuplicates: {}\nOut of order: {}\nDeadline misses: {}", report.duration.as_secs_f64(), report.sent, report.tracker.unique_received(), report.tracker.duplicates, report.tracker.out_of_order, report.misses);
    print_distribution("RTT", report.rtts);
    print_distribution("Jitter (absolute RTT delta)", report.jitters);
    print_distribution("Packet inter-arrival", report.inter_arrivals);
    if let Some(rtt) = summarize(report.rtts) {
        println!(
            "Estimated one-way p50: {:.3} ms\nEstimated one-way p95: {:.3} ms",
            rtt.p50 / 2_000.0,
            rtt.p95 / 2_000.0
        );
    }
    println!("CSV: {}", report.output.display());
}

fn print_distribution(label: &str, samples: &[f64]) {
    if let Some(s) = summarize(samples) {
        println!(
            "{label} (ms): min={:.3}, mean={:.3}, p50={:.3}, p95={:.3}, p99={:.3}, max={:.3}",
            s.min / 1000.0,
            s.mean / 1000.0,
            s.p50 / 1000.0,
            s.p95 / 1000.0,
            s.p99 / 1000.0,
            s.max / 1000.0
        );
    }
}

fn optional(value: Option<f64>) -> String {
    value.map(|v| format!("{v:.3}")).unwrap_or_default()
}
fn elapsed_ns(epoch: Instant) -> u64 {
    epoch.elapsed().as_nanos().min(u64::MAX as u128) as u64
}
fn wait_until(target: Instant) {
    let spin = Duration::from_micros(200);
    loop {
        let now = Instant::now();
        if now >= target {
            break;
        }
        let remaining = target - now;
        if remaining > spin {
            thread::sleep(remaining - spin);
        } else {
            std::hint::spin_loop();
        }
    }
}

impl Config {
    fn parse() -> Result<Self, Box<dyn std::error::Error>> {
        let server = arg("--server").unwrap_or_else(|| "127.0.0.1:50000".into());
        let duration = Duration::from_secs(parse("--duration-seconds", 600_u64)?);
        let interval_us = parse("--interval-micros", 2_500_u64)?;
        let packet_bytes = parse("--packet-bytes", DEFAULT_PACKET_BYTES)?;
        if duration.is_zero() || interval_us == 0 {
            return Err("duration and interval must be positive".into());
        }
        if !(HEADER_LEN..=MAX_PACKET_BYTES).contains(&packet_bytes) {
            return Err(format!("packet bytes must be {HEADER_LEN}..={MAX_PACKET_BYTES}").into());
        }
        Ok(Self {
            server,
            duration,
            interval: Duration::from_micros(interval_us),
            packet_bytes,
            output: arg("--output")
                .unwrap_or_else(|| "results/network-test.csv".into())
                .into(),
        })
    }
}
fn arg(name: &str) -> Option<String> {
    let args: Vec<String> = env::args().collect();
    args.windows(2).find(|p| p[0] == name).map(|p| p[1].clone())
}
fn parse<T: std::str::FromStr>(name: &str, default: T) -> Result<T, String> {
    arg(name)
        .map(|v| v.parse().map_err(|_| format!("invalid value for {name}")))
        .unwrap_or(Ok(default))
}
fn print_help() {
    println!("network-tester-client\n\nOptions:\n  --server ADDRESS          default 127.0.0.1:50000\n  --duration-seconds N      default 600\n  --interval-micros N       default 2500\n  --packet-bytes N          default 300 (includes 56-byte header)\n  --output PATH             default results/network-test.csv");
}
