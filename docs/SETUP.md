# M0 — Setup Guide: Immersive Web SDK (target: done by Oct 28)

> **Update Oct 28:** steps 3–5 are done. The IWSDK project was created and lives in the GitHub repo [Primal-Fire](https://github.com/ThomasThazhathillath/Primal-Fire), with these docs under `docs/`. On your PC, don't run `npm create` again: clone the repo into `C:\Dev` instead (outside OneDrive), then run `npm install` and `npm run dev` in it. For step 6, the build and GitHub Pages deploy are automated by `.github/workflows/deploy-pages.yml`; switch Pages on once under Settings → Pages → Source: **GitHub Actions**. See the [README](../README.md) for controls and checks.

**Engine switch (Oct 27):** we're leaning toward Meta's **Immersive Web SDK (IWSDK)** instead of Unity. IWSDK is a WebXR framework built on three.js, the same library the prototype uses, so the prototype's logic can be ported instead of rewritten. It also has a built-in emulator (IWER), so you can test VR with mouse and keyboard without a headset.

The rules allow IWSDK entries (step 1), so **you don't need to install Unity.** The old guide stays in [SETUP_UNITY.md](SETUP_UNITY.md) for reference only.

Work through the steps in order and tick each box.

---

## 1. Check the rules ✅ Done (Oct 27): web entries are allowed

From the [official rules](https://start-developer-competition-26.devpost.com/rules), section 4:

- **IWSDK (WebXR) is explicitly allowed.** You submit **a link** judges can open and test, for example on GitHub Pages. You can also host it on Vercel or elsewhere.
- Unity and other engines submit an APK to a "Competition" release channel instead. That doesn't apply to us.
- **There's no IWSDK-only special award this year.** Every engine competes on the same terms.
- **New Experience division:** the project must be built after Sept 24, 2026. Our prototype was started Oct 26, so it's fine to port it.

So we continue with IWSDK, and the Unity guide stays unused.

## 2. Apply to Meta VR Start (5 min)

- [ ] Apply from the competition page, using the same Meta developer account you'll submit with.
- [ ] Register for the competition on Devpost.

> If you still haven't been accepted by **Nov 10**, email the hackathon manager.

## 3. Tools (15 min)

- [ ] **Node.js 20.19 or newer.** ✅ Already installed: Node 24.20.0 is on this PC.
- [ ] **VS Code** (code.visualstudio.com) for editing, if you don't already have it.
- [ ] **Git**, which you already have because Git Bash is installed. Later you'll make a free **GitHub** account for backup and hosting.
- [ ] Chrome or Edge.

## 4. Create the project, NOT inside OneDrive

OneDrive fights the thousands of small files in `node_modules`, so keep the project in a plain local folder. Open a terminal in `C:\Dev`; create the folder if it doesn't exist. Then run:

```bash
npm create @iwsdk@latest
```

Answer the prompts like this:

| Prompt | Answer | Why |
|---|---|---|
| Project name | `primal-first-fire` | |
| Language | **TypeScript** | It catches typos before you run, and the IWSDK examples are TypeScript. |
| Experience type | **Virtual Reality** | |
| Hand Tracking | **Optional** | Hands must work end to end, but controllers are welcome too. |
| WebXR Layers | No | |
| Enable locomotion? | **Yes**, and **Yes** to running it on a Worker | Teleport, including hand micro-gesture teleport |
| Enable grabbing? | **Yes** | Pick up twigs, stones and the pot with your hands |
| Enable physics (Havok)? | **No** | We use snap spots, not physics. That's simpler and faster. |
| Meta Spatial Editor? | No | |
| Set up a Git repository? | **Yes** | |
| Install dependencies now? | **Yes** | |

- [ ] The project is created at `C:\Dev\primal-first-fire`.
- [ ] Afterwards, move `SETUP.md`, `PROJECT_STATUS.md`, `DESIGN.md` and the `prototype/` folder in there (or a `docs/` subfolder) so everything lives together.

## 5. Run it in the emulator (no headset needed)

In the project folder, run:

```bash
npm run dev
```

If the installer printed a different command, use that one.

- [ ] Open the `https://localhost:…` address it prints. Your browser will warn about a "self-signed certificate". That's expected for local development (WebXR only runs on https), so click through.
- [ ] Click **Enter XR**. Because there's no headset, the **IWER emulator** switches on automatically.
- [ ] Try it out:
  - Click Play mode to capture the mouse.
  - Hold **Left Shift + W A S D** to move the emulated headset.
  - Grab the sample object with an emulated hand.
- [ ] Try teleporting.

## 6. Put it online (the "done" line for M0)

A VR headset browser needs an **https web address**, so prove that early with the empty starter project:

- [ ] Build the project with `npm run build`. It's a standard Vite project; if that command doesn't exist, use the build command the installer printed. This creates a `dist/` folder.
- [ ] Host `dist/` for free on **GitHub Pages**. The rules point to GitHub Pages, and that address is what judges will open. I'll walk you through it.
- [ ] Open the URL on your phone or PC to check it loads.

When you're done, tell me:
- What worked.
- The IWSDK version, from `package.json`.
- Your GitHub Pages URL.

Then we start **M1**.

---

### If something breaks

- **`npm` isn't recognised:** close and reopen the terminal, or reinstall Node from nodejs.org.
- **A red error during `npm create`:** copy the **first** error line to me.
- **A blank page or nothing on Enter XR:** open DevTools (F12) → Console, and paste me the first red error.
- **On a Quest later:** connect it by USB and open `chrome://inspect/#devices` in desktop Chrome to see the headset browser's console.
