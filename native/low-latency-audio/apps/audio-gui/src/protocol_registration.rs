use std::{env, io, path::Path, process::Command};

const ROOT_KEY: &str = r"HKCU\Software\Classes\ssafystar";

pub enum RegistrationAction {
    Register,
    Unregister,
}

pub fn requested_action() -> Option<RegistrationAction> {
    env::args().find_map(|argument| match argument.as_str() {
        "--register-protocol" => Some(RegistrationAction::Register),
        "--unregister-protocol" => Some(RegistrationAction::Unregister),
        _ => None,
    })
}

pub fn apply(action: RegistrationAction) -> io::Result<()> {
    match action {
        RegistrationAction::Register => register(&env::current_exe()?),
        RegistrationAction::Unregister => run_reg(&["delete", ROOT_KEY, "/f"]),
    }
}

pub fn ensure_current_executable() -> io::Result<()> {
    register(&env::current_exe()?)
}

fn register(executable: &Path) -> io::Result<()> {
    let command = protocol_command(executable);
    run_reg(&[
        "add",
        ROOT_KEY,
        "/ve",
        "/d",
        "URL:SSAFY STAR Low Latency Audio",
        "/f",
    ])?;
    run_reg(&["add", ROOT_KEY, "/v", "URL Protocol", "/d", "", "/f"])?;
    run_reg(&[
        "add",
        &format!(r"{ROOT_KEY}\shell\open\command"),
        "/ve",
        "/d",
        &command,
        "/f",
    ])
}

fn protocol_command(executable: &Path) -> String {
    format!(r#""{}" "%1""#, executable.display())
}

fn run_reg(arguments: &[&str]) -> io::Result<()> {
    let status = Command::new("reg.exe").args(arguments).status()?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "reg.exe failed with exit code {:?}",
            status.code()
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_command_quotes_executable_and_uri() {
        let command = protocol_command(Path::new(r"C:\Program Files\SSAFY STAR\audio-gui.exe"));
        assert_eq!(
            command,
            r#""C:\Program Files\SSAFY STAR\audio-gui.exe" "%1""#
        );
    }
}
