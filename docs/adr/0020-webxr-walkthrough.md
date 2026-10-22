# ADR-0020: First-person walkthrough on the desktop and in WebXR (view only)

Status: Accepted (owner, 2026-10-22); implemented in T-062. Picking and connecting in first person were added by T-063 (see Amendment).

## Context
The owner asked whether the SDK can do a VR walkthrough of a plant, and later connect components in VR. The owner tests on a Meta Quest and chose a walkthrough first, with connect-in-VR to follow. The owner then asked for the same sense of being in the plant in a desktop browser, without a headset.

## Decision
- **No new dependency.** three.js 0.175 ships WebXR, and React Three Fiber 9 already switches to the session's animation loop while presenting. `@react-three/xr` was not added.
- **Opt-in:** `Scada3DViewer`/`Scada3DEditor` take `walkthrough?: boolean` (default false).
  - When it is set, **Walk** and **Enter VR** buttons sit at the bottom centre of the view.
  - The button is enabled only when `navigator.xr.isSessionSupported('immersive-vr')` resolves true. Otherwise it is disabled and gives the reason: a WebXR headset browser and an HTTPS page.
- **Session:** `immersive-vr` with optional `local-floor` and `bounded-floor`, using the `local-floor` reference space, so the walker's real eye height applies and the plant is at true metre scale.
- **Start pose:** standing on the floor under the desktop camera, facing the orbit target.
- **Locomotion:** the tracking space is moved, never the scene. The rig sets an offset reference space (`getOffsetReferenceSpace`) from a pose (x, z, yaw).
  - **Teleport:** hold the trigger to aim; a ray is drawn and a green ring marks the target. On release, the head lands where the ray meets the floor (y = 0), within 30 m and on the floor slab.
  - **Snap turn:** a thumbstick flick turns 30° about the head. The stick must return to centre before the next turn.
- **In VR:**
  - the floor slab is always drawn, and the background is set in the scene, because the page background is not shown in a headset;
  - the axis gizmo and transform gizmo are hidden;
  - nothing in the scene can be edited.
- **No network:** controllers are drawn as rays only. three's `XRControllerModelFactory` fetches models from a CDN, which the SDK does not allow.
- **Desktop walk** (`walk.ts`, `walkMode.tsx`):
  - First person at 1.7 m eye height, starting on the floor under the desktop camera and facing the orbit target.
  - Mouse look uses pointer lock, with drag-to-look where the browser refuses it. Pitch is limited to ±85°.
  - WASD or the arrow keys walk at 1.4 m/s; Shift runs at 3.5 m/s. A key tap counts as held for at least 150 ms, so a tap always takes a short step.
  - Space rises and Alt (Option on a Mac) sinks, at the same speeds. The eye stays between 0.6 m (a crouch) and 50 m. Rising stops with the eye under equipment overhead; sinking stops with the body standing on top of equipment.
  - Movement listeners run in the capture phase, so walking keys never reach the editor's shortcuts.
  - Equipment blocks the walker when its bounds reach into the body: from 1.45 m below the eye up to the eye, with a body radius of 0.3 m. The walker slides along it. Standing, overhead racks and floor-level parts can be walked under or over; once risen, the walker passes over equipment below the body. The walker stays inside the floor slab's plan.
  - A status line shows the position, the heading and the keys, with a crosshair at the centre.
  - Esc, or losing pointer lock, leaves Walk; the orbit camera and its target are restored.
  - While walking, the floor is drawn and the gizmos are hidden, as in VR.
- **HTTPS for the playground:** `PLAYGROUND_TLS_CERT`/`PLAYGROUND_TLS_KEY` make the Vite server use HTTPS, for example with a certificate from `tailscale cert`. The SDK itself is unaffected; the host page must be secure.

## Consequences
- The pure geometry is unit-tested in `xr.ts` and `walk.ts` (obstacles, steps, sliding, floor edge, look, key map). In `xr.ts` the tests cover: start pose, ray to floor, the offset as the inverse of the pose, teleport and turn about the head, and snap-turn arming.
- Playwright cannot open an immersive session. The e2e tests cover the button states and the session request, and the walk itself is checked on the owner's Quest. Desktop Walk is covered end to end: walking, a tap step, keys not reaching the editor, and Esc.
- Picking in first person is covered by the amendment below (T-063).

## Amendment (T-063, owner, 2026-10-22): pick and connect in first person
- **Picking:** `componentHit` (pick.ts) returns the first tagged component a ray meets. It looks through untagged geometry (grid, routed pipes, rays) and ignores markers (open joints, floor).
- **Same path as a click:** first-person picks call the view's `onSelect(id, { additive })`. In the editor, `additive` is Shift+click attach, so the attach rules, size checks, connection message, edit lock and undo are the editor's own. A view without `onSelect` cannot pick.
- **Desktop Walk:**
  - A click picks the part under the crosshair, whether the pointer is locked or (in drag mode) the press is not a drag.
  - **C** connects the part under the crosshair to the selected one.
  - The view's own pointer picking is off while walking, so only the crosshair picks.
  - The crosshair turns green on a part. A label names it and shows what a click and C will do.
- **VR:**
  - A trigger pulled with the ray on a part selects it instead of teleporting.
  - The grip on a part connects it to the selected one.
  - A ray on a part stops there and turns green; the teleport ring is shown only for the floor.
- **Tests:** `pick.test.ts` (5) covers occlusion, ancestors, instanced members, markers and misses. The Walk e2e test checks the aim label, connecting with C (one new connection and the editor's message) and selecting by click. VR picking needs the owner's Quest.

## Amendment (T-064, owner, 2026-10-22): edit the selected part while walking
- Inside the editor, keyboard focus moves to the editor while walking, because the Walk button that had focus is removed. The editor's own shortcuts for the selected part keep working:
  - R / Shift+R turn ±90°;
  - Delete / Backspace remove;
  - PageUp / PageDown raise and lower by 0.1 m (1 m with Shift);
  - Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Y redo;
  - Ctrl/Cmd+C/V copy and paste.
- The walk takes its own keys first (capture phase): movement, Space and Alt, plain C (not Ctrl/Cmd+C) and Esc. The arrows therefore walk instead of nudging, and Esc leaves Walk instead of clearing the selection.
- The aim label lists the editing keys for the selected part.
- Mouse-look ignores single movements over 200 px. Chrome can report one bogus jump just after the pointer locks, which spun the walker, and this made an e2e test flaky under parallel load.
- No new editing code: the editor's handlers, edit lock and undo history apply unchanged.
