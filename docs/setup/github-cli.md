# GitHub CLI setup on macOS

These steps install GitHub CLI with Homebrew and authenticate it with GitHub.com.
They assume Homebrew is already installed.

## Install and authenticate

Run:

```bash
brew install gh && gh auth login
```

`gh auth login` is interactive. For the repository's SSH workflow, select:

```text
Where do you use GitHub? GitHub.com
What is your preferred protocol for Git operations on this host? SSH
Upload your SSH public key to your GitHub account? /Users/<local-user>/.ssh/id_ed25519.pub
Title for your SSH key: GitHub CLI
How would you like to authenticate GitHub CLI? Login with a web browser
```

Before uploading an existing key, confirm that it is the public key you intend
to associate with the selected GitHub account:

```bash
ssh-keygen -lf /Users/<local-user>/.ssh/id_ed25519.pub
```

If that key does not exist or is not the intended key, choose another public
key or skip key upload and follow GitHub's SSH-key setup instructions. Do not
attach a shared or unfamiliar key merely because it is offered by the prompt.

GitHub CLI displays a short-lived device code and asks you to open the device
login page:

```text
First copy your one-time code: <one-time-device-code>
Press Enter to open https://github.com/login/device in your browser...
```

Do not paste an active device code into documentation, issues, chat, or logs.
Enter it only on GitHub's device login page. A successful flow ends with output
similar to:

```text
Authentication complete.
Configured git protocol.
SSH key uploaded, or the selected key already exists on your GitHub account.
```

Homebrew may auto-update, display analytics information, install shell
completions, or clean older package versions. That output varies by machine and
is not an authentication error.

## Verify authentication

Run:

```bash
gh auth status
```

The output should identify `github.com`, show an authenticated account, and
report `ssh` as the Git operations protocol. Review the output before sharing
it because it can contain your GitHub username and credential-storage details.

## Protect authentication details

Before sharing terminal output, replace local usernames, computer names,
absolute home-directory paths, GitHub usernames, and device codes with obvious
placeholders. Never publish a device code while it is active. Homebrew version,
download, and filesystem output is volatile and is not needed to document the
procedure.
