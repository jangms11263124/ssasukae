#[cfg(windows)]
mod platform {
    use std::os::windows::ffi::OsStrExt;
    use std::{ffi::OsStr, io};
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE},
            System::Threading::CreateMutexW,
        },
    };

    pub struct InstanceGuard(HANDLE);

    impl Drop for InstanceGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }

    pub fn acquire(name: &str) -> io::Result<Option<InstanceGuard>> {
        let wide: Vec<u16> = OsStr::new(name).encode_wide().chain(Some(0)).collect();
        let handle = unsafe { CreateMutexW(None, false, PCWSTR(wide.as_ptr())) }?;
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe {
                let _ = CloseHandle(handle);
            }
            return Ok(None);
        }
        Ok(Some(InstanceGuard(handle)))
    }
}

#[cfg(not(windows))]
mod platform {
    use std::io;

    pub struct InstanceGuard;

    pub fn acquire(_name: &str) -> io::Result<Option<InstanceGuard>> {
        Ok(Some(InstanceGuard))
    }
}

pub use platform::InstanceGuard;

pub fn acquire() -> std::io::Result<Option<InstanceGuard>> {
    platform::acquire("Local\\SSAFYStar.LowLatencyAudio.Singleton")
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn a_second_process_lock_is_rejected_until_the_first_is_released() {
        let name = format!(
            "Local\\SSAFYStar.LowLatencyAudio.Test.{}",
            std::process::id()
        );
        let first = platform::acquire(&name).unwrap().expect("first lock");
        assert!(platform::acquire(&name).unwrap().is_none());
        drop(first);
        assert!(platform::acquire(&name).unwrap().is_some());
    }
}
