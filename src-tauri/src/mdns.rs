use mdns_sd::{ServiceDaemon, ServiceInfo};

pub fn advertise(local_ip: &str, port: u16) {
    let ip = local_ip.to_string();
    std::thread::spawn(move || {
        match ServiceDaemon::new() {
            Ok(mdns) => {
                let hostname = format!("{}.local.", gethostname());
                match ServiceInfo::new(
                    "_event-timer._tcp.local.",
                    "EventTimer",
                    &hostname,
                    ip.as_str(),
                    port,
                    None,
                ) {
                    Ok(info) => {
                        if let Err(e) = mdns.register(info) {
                            eprintln!("mDNS register error: {e}");
                        } else {
                            println!("mDNS: advertising _event-timer._tcp on port {port}");
                            // Keep the daemon alive
                            loop {
                                std::thread::sleep(std::time::Duration::from_secs(60));
                            }
                        }
                    }
                    Err(e) => eprintln!("mDNS ServiceInfo error: {e}"),
                }
            }
            Err(e) => eprintln!("mDNS daemon error: {e}"),
        }
    });
}

fn gethostname() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| {
            let mut buf = [0u8; 64];
            // SAFETY: gethostname is a standard POSIX call
            unsafe {
                libc_gethostname(&mut buf);
            }
            std::str::from_utf8(&buf)
                .map(|s| s.trim_matches('\0').to_string())
                .map_err(|_| std::env::VarError::NotPresent)
        })
        .unwrap_or_else(|_| "localhost".to_string())
}

// Thin wrapper so we don't need the libc crate just for gethostname.
#[cfg(unix)]
unsafe fn libc_gethostname(buf: &mut [u8]) {
    extern "C" {
        fn gethostname(name: *mut std::os::raw::c_char, len: usize) -> std::os::raw::c_int;
    }
    gethostname(buf.as_mut_ptr() as *mut _, buf.len());
}

#[cfg(not(unix))]
unsafe fn libc_gethostname(buf: &mut [u8]) {
    // On non-Unix, leave buf unchanged → falls back to "localhost"
    let _ = buf;
}
