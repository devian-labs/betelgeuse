//! Starting command-line tools (git, ffmpeg, …) from a windowed app.

use std::ffi::OsStr;
use std::process::Command;

/// A `Command` for `program` that runs without a window. On Windows, a console program started
/// from a GUI app otherwise opens a console window of its own, which flashes on screen for every
/// git call. Elsewhere this is plain `Command::new`.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
