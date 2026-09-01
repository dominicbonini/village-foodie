# Android signing — read this first if you have forgotten everything

**No credentials appear in this file, and none ever should.** It explains where things are and what to
do; the values live in a password manager.

## The two keys, and why the distinction matters more than anything else here

There are **two** signing keys and they are not interchangeable.

| | Held by | What it does |
|---|---|---|
| **Upload key** | **You** — `android/hatchgrab-upload.keystore` | Signs the AAB you upload. Proves the upload came from you. |
| **App signing key** | **Google**, under **Play App Signing** | The key Android devices actually verify. Google re-signs every release with it. |

🔴 **BECAUSE GOOGLE HOLDS THE APP SIGNING KEY, LOSING THE UPLOAD KEY IS RECOVERABLE.** You request an
upload key reset and carry on shipping updates to the same listing.

🔴 **WITHOUT PLAY APP SIGNING IT WOULD NOT BE.** If the app were signed only by a local key and that key
were lost, **the app could never be updated again** — not by any means, not by contacting Google. The
only path would be publishing a new listing under a new package name and abandoning every existing
install, review and rating. **That is the failure Play App Signing exists to prevent, and it is why
enrolling in it is not optional in practice.**

## Where things are

- **The keystore:** `android/hatchgrab-upload.keystore` — **gitignored, never committed.**
- **The credentials:** `android/keystore.properties` — **gitignored, never committed.**
- **The template:** `android/keystore.properties.example` — **committed**, placeholders only.
- **The passwords and a backup copy of the keystore** are held **outside this repository**.
  🔴 **Look for the password manager entry titled "Android keystore".** It has what you need.
  ⚠️ **Do not paste those values into a file in this repo, a chat, a ticket, or a report.**

## The facts you will need

- **Alias:** `hatchgrab`
- **Key type:** 2048-bit RSA, PKCS12 keystore
- **applicationId:** `com.hatchgrab.app`

## If the keystore is lost

1. **Do not panic and do not create a new listing.** Play App Signing means this is recoverable.
2. Generate a **new** upload key.
3. In **Play Console → Setup → App integrity**, request an **upload key reset** and provide the new
   certificate.
4. Google reviews it and swaps the registered upload key.

⚠️ **RECOVERABLE, BUT SLOW.** The reset is a manual review on Google's side and takes days, not minutes.
**It is not a substitute for the backup — it is what you fall back on when the backup is also gone.**

## How the build uses it

`android/app/build.gradle` loads `android/keystore.properties` **only if the file exists**. When it is
absent — a fresh clone, CI, anyone who has not been given the credentials — **the release signingConfig
is simply not created and every debug build works exactly as before.** A missing credentials file must
never break the build for someone who is not shipping a release.

⚠️ **A release build produced without that file is UNSIGNED and Play will reject it.** That is the
intended behaviour: it fails at upload, loudly, rather than producing something that looks shippable.
