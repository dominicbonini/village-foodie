package com.hatchgrab.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * ── THIS FILE IS THE SINGLE OWNER OF THE ANDROID WINDOW INSETS AND SYSTEM-BAR APPEARANCE ──────────
 *
 * IT WAS FOUR LINES AND AN EMPTY BODY. Everything below replaces behaviour that Capacitor's core
 * SystemBars plugin was supplying by default, and it exists because that default paints a fixed navy
 * band across the bottom of the screen.
 *
 * ── WHAT WAS WRONG ────────────────────────────────────────────────────────────────────────────────
 * @capacitor/android 8.4.1 installs an inset listener on the WebView's PARENT view
 * (plugin/SystemBars.java:199) and, on the non-passthrough branch (WebView < 140), pads that parent on
 * ALL FOUR SIDES — line 228:
 *
 *     v.setPadding(systemBarsInsets.left, systemBarsInsets.top, systemBarsInsets.right,
 *                  keyboardVisible ? imeInsets.bottom : systemBarsInsets.bottom);
 *
 * The WebView therefore stops short of the bottom of the window, and the strip it vacates is PADDING
 * ON THE PARENT — not part of the WebView at all. Padding shows the view behind it, which is the decor
 * view, painted with android:windowBackground. Ours is @color/hgHeaderNavy (#0F172A), chosen so the
 * STATUS strip would read as continuous with the navy AppHeader. One decision, two strips, only one of
 * them considered: the same navy landed at the bottom, under page content that is #F9F9F9.
 *
 * MEASURED, not reasoned: before this change the bottom 28px (14dp) of every screen sampled #0F172A —
 * identical on the admin table, on two dashboard tabs, and under a bg-black/50 modal scrim whose own
 * colour at that point was #7C7D7E. A band that does not change when the content behind it changes is
 * a fixed colour, and that is the defect.
 *
 * ── WHY THE FIX LIVES HERE AND NOT IN THE WEB LAYER ───────────────────────────────────────────────
 * 🔴 THE iOS BUILD IS IN APP STORE REVIEW AND NOTHING THAT AFFECTS IT MAY CHANGE. iOS reaches the
 * bottom edge already: @capacitor/ios's SystemBars.swift contains no inset code of any kind, and
 * contentInset:'never' hands the safe area to CSS, which AppHeader consumes via
 * env(safe-area-inset-top). Every plausible web-layer fix — a padding keyed to
 * env(safe-area-inset-bottom), a change to the viewport export, an edit to lib/native/statusBar.ts —
 * is shared code that iOS executes. This file is compiled into the Android APK and nothing else, so it
 * is the only place a fix can be made that provably cannot reach the iPad.
 * ⚠️ NO WEB FILE, NO SHARED COMPONENT, NO CSS AND NO CAPACITOR CONFIG KEY IS TOUCHED BY THIS CHANGE.
 * capacitor.config.ts is deliberately NOT edited — see installInsetOwner() for why that was possible.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Capacitor builds the Bridge, creates the WebView and loads its plugins inside this call, so
        // SystemBars has registered its listener by the time it returns. Both installers below depend on
        // running AFTER it; neither may be moved above this line.
        super.onCreate(savedInstanceState);

        installInsetOwner();
        installSystemBarAppearanceGuard();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        // super dispatches to the Bridge, which calls SystemBars.handleOnConfigurationChanged, which
        // re-applies its OWN cached style and undoes our appearance (see the guard below for the full
        // account). Re-asserting after super is what puts us last.
        super.onConfigurationChanged(newConfig);
        enforceSystemBarAppearance();
    }

    /**
     * ── INSETS: ONE OWNER, AND IT IS THIS LISTENER ────────────────────────────────────────────────
     *
     * 🔴 WHY THIS REPLACES CAPACITOR'S RATHER THAN COEXISTING WITH IT. A View holds exactly ONE
     * OnApplyWindowInsetsListener — ViewCompat.setOnApplyWindowInsetsListener stores it in a tag and
     * the second call overwrites the first. SystemBars registered its listener on this same parent view
     * during super.onCreate() above; this call replaces it. That is not a race: both run on the main
     * thread, in this order, every launch. After this line the plugin's listener is unreachable and
     * this method is the only code that will ever pad the WebView's parent.
     *
     * ⚠️ THE ALTERNATIVE WAS plugins.SystemBars.insetsHandling:'disable', AND IT WAS DECLINED ON
     * PURPOSE. That key is read only by SystemBars.java:99 — iOS's SystemBars.swift.load() reads
     * `hidden`, `style` and `animation` and nothing else — so it would have been safe for the iPad. But
     * it lives in capacitor.config.ts, a SHARED file, and applying it would have required `npx cap sync
     * android` to regenerate the baked config. Doing it here instead means the entire change is confined
     * to android/, which is the strongest possible guarantee while the iOS build is in review.
     *
     * ── WHAT CHANGES AND WHAT DELIBERATELY DOES NOT ───────────────────────────────────────────────
     * TOP, LEFT, RIGHT are padded with exactly the values Capacitor used. The top strip therefore stays
     * navy and stays 48px (24dp), continuous with AppHeader, and the left/right padding still keeps
     * content clear of a display cutout or a side-mounted navigation bar in landscape. NOTHING ABOUT
     * THE TOP OF THE APP CHANGES.
     *
     * BOTTOM IS ZERO. That is the whole fix. The WebView now reaches the bottom edge of the window, so
     * the bottom strip is whatever the page paints there — #F9F9F9 on the dashboard, #7C7D7E under a
     * modal scrim, white on the KDS — instead of a fixed navy that ignored all three.
     *
     * ⚠️ THE KEYBOARD CASE IS PRESERVED EXACTLY. When the IME is up we pad by imeInsets.bottom, which
     * is what Capacitor did (SystemBars.java:232). Without it a focused input at the foot of Manage or
     * Add-order would sit behind the keyboard. This is the one case where a bottom inset is still right.
     *
     * 🔴 THE RETURNED INSETS ARE ZEROED, AND THAT IS WHAT KEEPS iOS AND THE WEB LAYER OUT OF THIS.
     * Capacitor zeroes them too (SystemBars.java:239-241) so that env(safe-area-inset-*) resolves to 0
     * inside the WebView. Keeping that behaviour means AppHeader's `paddingTop: env(safe-area-inset-top)`
     * and the KDS header's `max(0.625rem, env(safe-area-inset-top))` still evaluate to their zero case
     * on Android, exactly as they did before — the shared CSS is not merely unedited, it is inert. If we
     * passed real insets through instead, those two declarations would start applying and we would have
     * changed the web layout on Android without touching a web file. We do not.
     * ⚠️ Zeroing rather than returning WindowInsetsCompat.CONSUMED is deliberate and is Capacitor's own
     * note: CONSUMED breaks recalculation on later passes (crbug 461332423).
     */
    private void installInsetOwner() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final View parent = (View) getBridge().getWebView().getParent();
        if (parent == null) return;
        insetParent = parent;
        applySurface(true);

        ViewCompat.setOnApplyWindowInsetsListener(parent, (v, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            v.setPadding(bars.left, bars.top, bars.right, keyboardVisible ? ime.bottom : 0);

            return new WindowInsetsCompat.Builder(insets)
                .setInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(),
                    Insets.of(0, 0, 0, 0)
                )
                .build();
        });

        // SystemBars only asks for a fresh inset pass on page commit; the parent already has the
        // plugin's four-sided padding on it at this moment, so ask for one now rather than showing the
        // old bottom padding until the first navigation.
        ViewCompat.requestApplyInsets(parent);
    }

    /**
     * ── THE TOP STRIP TAKES THE COLOUR OF THE SURFACE BEHIND IT, NOT A FIXED VALUE ────────────────
     *
     * 🔴 THIS IS THE SAME PRINCIPLE AS THE BOTTOM FIX, APPLIED TO THE EDGE THAT STILL HAS PADDING.
     * The bottom needed no colour decision at all: removing the padding let the page paint there, so the
     * strip became whatever the content is. The top cannot be solved that way — see installInsetOwner
     * for why the top padding has to stay — so the strip's colour has to be chosen, and choosing ONE
     * fixed colour is exactly the defect this workstream exists to remove.
     *
     * android:windowBackground was that fixed colour. It is #0F172A, and it is right above a navy
     * AppHeader (dashboard, manage, admin) and wrong above the KDS, whose header is bg-white: the strip
     * read as a dark band sitting on top of a white screen. So the strip is now painted on the WebView's
     * PARENT VIEW, whose background can change at runtime, instead of inheriting the window's, which
     * cannot. A View draws its background across its full bounds INCLUDING its padding, which is exactly
     * the region we need.
     * ⚠️ THE WINDOW BACKGROUND IS DELIBERATELY LEFT ALONE. It is still #0F172A and still does its other
     * jobs — the pre-WebView frame at launch and the decor fill that SystemBars.setStyle:299 re-applies.
     * Changing it would have reached the launch flash; painting the parent does not.
     *
     * ── HOW THE SURFACE IS IDENTIFIED, AND THE HONEST COST OF IT ──────────────────────────────────
     * From the WebView's own URL, read natively. That is the only input available: the alternative is a
     * signal from the web layer, and every web file is shared code that the iOS build in review would
     * also execute.
     * ⚠️ IT PUTS ROUTE KNOWLEDGE IN A SECOND PLACE, AND THAT IS A REAL COST. `/kds/<kds_token>` and
     * `/dashboard/<token>/kds` are defined in app/, and this file now also has to know them. If a KDS
     * route is ever renamed, the strip silently goes navy again on that route and nothing fails loudly.
     * It was accepted because the constraint left no other input, not because it is the better design;
     * once the iOS build is out of review, a shared per-surface signal would replace it and should.
     *
     * ── THE GLYPHS FOLLOW THE STRIP, WHICH IS THE WHOLE POINT ─────────────────────────────────────
     * One input decides both, so they cannot disagree — and disagreeing is the defect that was measured
     * before this change. Navy strip: light glyphs. White strip: dark glyphs.
     */
    private View insetParent = null;
    private boolean surfaceIsLight = false;
    private String lastUrl = null;
    private long lastUrlCheckMs = 0L;

    /** The KDS is reached as /kds/<kds_token> and as /dashboard/<token>/kds. Query and hash are dropped
     *  first so ?van_id=… cannot defeat the suffix test. */
    private static boolean isKdsUrl(String url) {
        if (url == null) return false;
        int cut = url.indexOf('?');
        if (cut >= 0) url = url.substring(0, cut);
        cut = url.indexOf('#');
        if (cut >= 0) url = url.substring(0, cut);
        return url.endsWith("/kds") || url.contains("/kds/");
    }

    /**
     * @param force repaint even when the URL has not changed — used once at install time, when there is
     *              no previous URL to compare against and the parent still carries the plugin's state.
     */
    private void applySurface(boolean force) {
        if (insetParent == null) return;
        String url = (getBridge() != null && getBridge().getWebView() != null)
            ? getBridge().getWebView().getUrl()
            : null;
        if (!force && url != null && url.equals(lastUrl)) return;
        lastUrl = url;

        boolean light = isKdsUrl(url);
        surfaceIsLight = light;
        // bg-white on the KDS header; @color/hgHeaderNavy elsewhere, which is what AppHeader paints.
        insetParent.setBackgroundColor(light ? Color.WHITE : getResources().getColor(R.color.hgHeaderNavy, getTheme()));
        enforceSystemBarAppearance();
    }

    /**
     * ── SYSTEM-BAR APPEARANCE: ONE OWNER, AND IT IS THIS GUARD ────────────────────────────────────
     *
     * TWO SEPARATE MECHANISMS WERE SETTING THE STATUS GLYPHS WRONG, AND BOTH WERE MEASURED BEFORE THIS
     * WAS WRITTEN.
     *
     *   (A) THE KDS ASKS FOR DARK GLYPHS ON A PREMISE THAT IS ONLY TRUE ON iOS.
     *       app/dashboard/[token]/kds/page.tsx:831 calls configureStatusBar('dark') because "the KDS's
     *       top bar is bg-white and fills the safe-area strip". On iOS it does. On Android it could not:
     *       env(safe-area-inset-top) is zero, the white header stopped below the strip, and the strip was
     *       navy. MEASURED on a cold launch straight into the KDS, with no rotation involved: zero pixels
     *       in the top 48 rows were more than 40 luminance above the background — the clock, wifi and
     *       battery were drawn in near-black on near-black.
     *       ⚠️ NOTE WHAT applySurface() DOES TO THIS. The KDS strip is now WHITE, so the KDS's request
     *       for dark glyphs is, on this platform, finally correct. The guard no longer contradicts it —
     *       it arrives at the same answer from the strip colour, which is the thing that actually
     *       determines legibility. On every other surface the strip is navy and the guard asks for light.
     *
     *   (B) CAPACITOR RE-ASSERTS ITS OWN CACHED STYLE ON EVERY CONFIGURATION CHANGE.
     *       SystemBars and @capacitor/status-bar each keep a private field for "the current status-bar
     *       style" — SystemBars.currentStatusBarStyle and StatusBar.currentStyle — on two different
     *       objects, and neither updates the other. SystemBars seeds its field at load from
     *       plugins.SystemBars.style, which we do not configure, so it resolves DEFAULT through
     *       getStyleForTheme() to LIGHT (meaning dark glyphs) and caches the RESOLVED value — which is
     *       why it does not even track the theme it was resolved from. Then handleOnConfigurationChanged
     *       (SystemBars.java:88-93) replays it. Because the Activity declares orientation, screenSize,
     *       uiMode and density in android:configChanges, Android does NOT recreate it — it calls
     *       onConfigurationChanged, so the React tree never remounts and nothing ever calls
     *       configureStatusBar again. MEASURED: one rotation took a readable status bar (2,724 bright
     *       pixels, 2.2% of the strip) to zero, and rotating back did not restore it.
     *
     * ── WHY A PRE-DRAW GUARD AND NOT A ONE-SHOT CALL ──────────────────────────────────────────────
     * (B) alone could be handled in onConfigurationChanged above, and it is. (A) and the surface check
     * cannot: they arrive from JavaScript and from client-side routing, at whatever moment a React effect
     * or a router.push happens to run. A pre-draw listener is the one hook that covers all of it without
     * reaching outside android/.
     * ⚠️ IT IS CHEAP, AND THE GUARDS ARE WHAT MAKE IT CHEAP. Each frame reads two booleans and returns;
     * the setters run ONLY on an actual drift. The URL — the one genuinely non-trivial read — is
     * throttled to 4x a second and then compared, so a settled screen issues no window calls at all.
     * This matters because the KDS runs unattended for a whole service.
     * ⚠️ ALWAYS RETURNS TRUE — returning false would cancel the frame.
     *
     * ── THE NAVIGATION BAR, WHICH NOW MATTERS FOR THE FIRST TIME ──────────────────────────────────
     * 🔴 THIS IS A CONSEQUENCE OF THE INSET FIX AND MUST SHIP WITH IT. Before, the gesture pill sat on
     * the navy band and the system's default light pill was legible. Now the page is behind it, and every
     * operator surface is light there (#F8FAFC on the dashboard and the KDS), so a light pill would be
     * invisible on its own background. setAppearanceLightNavigationBars(true) means DARK icons FOR a
     * light background — the same inverted naming as the status-bar API, which is why it is spelled out.
     * ⚠️ UNCONDITIONAL, unlike the status bar: the bottom of every operator surface is light, whereas the
     * top strip genuinely differs between the KDS and everything else.
     */
    private void installSystemBarAppearanceGuard() {
        final View decor = getWindow().getDecorView();
        enforceSystemBarAppearance();
        decor.getViewTreeObserver().addOnPreDrawListener(() -> {
            long now = SystemClock.uptimeMillis();
            if (now - lastUrlCheckMs > 250L) {
                lastUrlCheckMs = now;
                applySurface(false);
            }
            enforceSystemBarAppearance();
            return true;
        });
    }

    private void enforceSystemBarAppearance() {
        Window window = getWindow();
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());

        // isAppearanceLightStatusBars() == true means DARK glyphs, which is right on the KDS's white
        // strip and wrong on every navy one. surfaceIsLight is the single input; see applySurface.
        if (controller.isAppearanceLightStatusBars() != surfaceIsLight) {
            controller.setAppearanceLightStatusBars(surfaceIsLight);
        }
        // isAppearanceLightNavigationBars() == true means DARK icons, which is what the light page
        // content now behind the gesture bar needs.
        if (!controller.isAppearanceLightNavigationBars()) {
            controller.setAppearanceLightNavigationBars(true);
        }
    }
}
