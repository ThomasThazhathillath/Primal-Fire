# Fallback: Unity M0 setup (only if web entries are NOT allowed)

> On hold since Oct 27. The plan is now IWSDK (see SETUP.md). Use this only if the Devpost rules exclude web entries.

Work through the steps in order and tick each box. Most of the time goes to downloads, so start installs first and do step 1 while they run.

---

## 1. Apply to Meta VR Start (5 min) — do this first

- [ ] Apply from the competition page ("apply now to join"). Use the same Meta developer account you'll upload with.
- [ ] Register for the competition on Devpost.
- [ ] When accepted, make sure you can open the **Meta VR Developer Dashboard**. You don't need to create the app yet; that happens in M5.

> If acceptance is still missing on **Nov 10**, email the hackathon manager. You can't create the "Competition" release channel without access.

## 2. Install Unity (~1 h, mostly downloading)

- [ ] Install **Unity Hub** from unity.com/download and sign in. A free Personal license is fine.
- [ ] In Hub → Installs → Install Editor, choose **Unity 6 (6000.0.x LTS)** with the **highest patch available, at least 6000.0.66f2**. That's the minimum for Meta XR All-in-One 207.
- [ ] Tick these modules:
  - **Android Build Support**
    - **OpenJDK**
    - **Android SDK & NDK Tools**
  - Microsoft Visual Studio Community, if you don't already have VS or Rider. You need it for C# autocomplete.
- [ ] Have about 25 GB free.

## 3. Create the project — NOT inside OneDrive

OneDrive sync fights Unity: it locks files in the huge `Library/` folder and burns bandwidth. Create the project in a plain local folder:

```
C:\Dev\PrimalFirstFire
```

- [ ] In Hub → New project, pick the **Universal 3D** template (URP). Name it `PrimalFirstFire` and put it in `C:\Dev`.
- [ ] Afterwards, move `SETUP.md` and `PROJECT_STATUS.md` into that folder so everything lives together.
- [ ] Back up with **git + GitHub** instead of OneDrive. A Unity `.gitignore` is added in M1.

## 4. Switch to Android

- [ ] Go to **File → Build Profiles** (Unity 6), select **Meta Quest** if it's listed or **Android** otherwise, and click **Switch Platform**.

## 5. Install Meta XR packages

- [ ] Open the Unity Asset Store page for **Meta XR All-in-One SDK** and click "Add to My Assets".
- [ ] In the Editor, go to **Window → Package Manager → My Assets → Meta XR All-in-One SDK → Install**.
  - Check the version shows **207.x**.
  - Accept any restarts or "enable new input system" prompts.
- [ ] In Package Manager → Unity Registry, install **XR Plug-in Management** and **OpenXR Plugin**, if All-in-One didn't already pull them in.
- [ ] **Don't** install the "Oculus XR Plugin". It's deprecated.

## 6. Configure XR

- [ ] Open **Edit → Project Settings → XR Plug-in Management**.
  - On the **Android** tab, tick **OpenXR**.
  - Under it, enable the **Meta Quest** feature group.
- [ ] Open the **OpenXR** settings (Android tab) and tick these features:
  - **Meta Quest Support**
  - **Hand Tracking Subsystem**
  - **Meta Hand Tracking Aim**
- [ ] On the **Windows/PC** tab, tick **OpenXR** too. This lets the simulator run in Play mode.
- [ ] Open **Meta XR → Project Setup Tool** (Edit → Project Settings → Meta XR) and click **Fix All** on both the Android and Windows tabs. Repeat until nothing is red.
- [ ] Find the **Hand Tracking Support** setting. It's under OVRManager's "Quest Features" on the camera rig, or in the Meta XR settings. Set it to **Controllers and Hands** for now; we switch to **Hands Only** before submission to prove the hands-first requirement.

## 7. Player settings (Android)

Check these, and let the Setup Tool win if it disagrees:
- [ ] Scripting Backend: **IL2CPP**
- [ ] Target Architectures: **ARM64** only
- [ ] Graphics API: **Vulkan**
- [ ] Texture compression: **ASTC**
- [ ] Minimum API Level: whatever the Setup Tool sets

## 8. Meta XR Simulator

- [ ] Install the **Meta XR Simulator 207.1** for Windows from developers.meta.com → Downloads → Meta XR Simulator. It may also come with All-in-One.
- [ ] In the Editor toolbar, find the **Meta XR Simulator** toggle (the headset icon) and **activate** it.
- [ ] Press **Play**. A simulator window should open with a virtual room.
- [ ] Find the hands mode. The simulator can switch from virtual controllers to **hands**. Version 207.1 can also track your real hands with your webcam ("camera-tracked hands"), which now report pinch and grab.

## 9. Smoke test (the "done" line for M0)

- [ ] Open the Package Manager and import an **Interaction SDK sample**: Meta XR Interaction SDK → Samples → **Example Scenes**.
- [ ] Open a hands sample scene. Look for "HandGrabExamples", "TeleportExamples" or similar.
- [ ] Press Play with the simulator on, switch to **hands**, and **grab an object with a pinch**.
- [ ] Try the teleport sample with hands.
- [ ] Go to **File → Build Profiles → Build** and create an **APK** in `C:\Dev\PrimalFirstFire\Builds\`. It just needs to build without errors; there's no headset to run it on.

When you're done, tell me what worked and paste the exact versions installed:
- Unity
- All-in-One
- OpenXR
- Simulator

Then we start **M1 (the vertical slice)**.

---

### If something breaks

- **The simulator won't connect after a package update:** restart the Unity Editor.
- **Lots of red errors right after import:** let the import finish, then restart Unity. Copy the *first* error to me. Later errors are usually caused by the first one.
- **"Android SDK not found":** reinstall the Android module from Unity Hub → Installs → ⚙ → Add modules.
