package com.hatchgrab.app;

import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.Window;
import androidx.activity.EdgeToEdge;
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
/*
 * ── ⚠️ UPDATED (android-1-1, 15 November 2026, docs/android-1-1-report.md §3) ─────────────────────────
 * THREE THINGS CHANGED WITH CAPACITOR 8.6.2 AND PLAY'S EDGE-TO-EDGE NOTICES, AND THE NOTE ABOVE IS HISTORY:
 *
 * 1. @capacitor/android 8.6.2 MOVED SystemBars' LISTENER TO THE DECOR VIEW (plugin/SystemBars.java:190,
 *    `getActivity().getWindow().getDecorView()`). Replacing the listener on the WebView's parent no longer
 *    displaces it: the decor listener runs FIRST, pads the decor and hands the parent zeroed insets, so on a
 *    WebView older than 140 the navy bottom band above would come straight back. So Capacitor's own handling
 *    is now switched off the supported way, `plugins.SystemBars.insetsHandling: 'disable'` in
 *    capacitor.config.ts (read only by the Android plugin; iOS's SystemBars.swift reads style and animation),
 *    and this file remains the ONE owner of the insets.
 *
 * 2. THE BOTTOM IS PADDED AGAIN, BY THE NAVIGATION BAR, AND PAINTED LIGHT. Zero bottom padding put the page
 *    under the navigation bar: harmless under a gesture pill, but with 3-button navigation (48dp) the phone
 *    "Add order" total bar, the Documents send bar and the session banner sat UNDER the buttons, and none of
 *    them carries env(safe-area-inset-bottom). Play's edge-to-edge review asks exactly that nothing sits under
 *    a system bar. The fix keeps the old defect fixed too: the strip is painted the operator surfaces' own
 *    light background (#F8FAFC), not the header navy, by BarsBackground below. Nothing in the web layer
 *    changes and the insets handed to the WebView stay zero, so the shared CSS stays inert on Android.
 *
 * 3. EdgeToEdge.enable(this) (androidx.activity). Android 15+ draws edge-to-edge for any app targeting 35+;
 *    Android 14 and older only when the app asks. Play's "edge-to-edge may not display for all users" notice
 *    is about that difference, and Capacitor's own docs recommend this call (it becomes automatic in
 *    Capacitor 9). With it, every Android version takes the SAME path through installInsetOwner().
 *
 * And @capacitor/status-bar is no longer in the Android build (capacitor.config.ts android.includePlugins): it
 * was the only code in the app calling the edge-to-edge APIs Play flags as deprecated
 * (Window.setStatusBarColor, FLAG_TRANSLUCENT_STATUS, SYSTEM_UI_FLAG_*). Its one useful Android call,
 * setStyle, is what enforceSystemBarAppearance() below already owns. lib/native/statusBar.ts's calls on
 * Android now reject inside its existing try/catch, which is all they did that mattered.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Capacitor builds the Bridge, creates the WebView and loads its plugins inside this call, so
        // SystemBars has registered its listener by the time it returns. Both installers below depend on
        // running AFTER it; neither may be moved above this line.
        super.onCreate(savedInstanceState);

        // android-1-1: edge-to-edge on EVERY Android version, not only 15+ (see the note above). After super,
        // because BridgeActivity sets the theme and content view there; the insets are re-requested below.
        EdgeToEdge.enable(this);

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
     * ⛔ SUPERSEDED (android-1-1): the bottom is padded by the navigation bar again and painted light by
     * BarsBackground; see the note at the top of the class. The original reasoning follows.
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
        barsBackground = new BarsBackground(getResources().getColor(R.color.hgHeaderNavy, getTheme()), BOTTOM_STRIP);
        parent.setBackground(barsBackground);
        applySurface(true);

        ViewCompat.setOnApplyWindowInsetsListener(parent, (v, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            // android-1-1: the bottom is the navigation bar's height again (or the keyboard's), so nothing
            // sits under 3-button navigation; BarsBackground paints that strip light, not navy.
            int bottom = keyboardVisible ? ime.bottom : bars.bottom;
            v.setPadding(bars.left, bars.top, bars.right, bottom);
            if (barsBackground != null) barsBackground.setBands(bars.top, bottom);

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
    private BarsBackground barsBackground = null;
    /** The operator surfaces' light background (slate-50, #F8FAFC: the dashboard, Manage and the KDS). */
    private static final int BOTTOM_STRIP = 0xFFF8FAFC;

    /**
     * android-1-1: the WebView's parent background. A View paints its background across its padding, so this
     * is what shows in the strips the insets reserve: the TOP band (and the side bands in landscape) in the
     * header's colour, as before, and the BOTTOM band (the navigation bar's height) in the page's light colour,
     * so padding the bottom again does not bring back the navy band the note above was written to remove.
     */
    private static final class BarsBackground extends Drawable {
        private final Paint top = new Paint(), bottom = new Paint();
        private int topBand = 0, bottomBand = 0;
        BarsBackground(int topColor, int bottomColor) { top.setColor(topColor); bottom.setColor(bottomColor); }
        void setTopColor(int c) { if (top.getColor() != c) { top.setColor(c); invalidateSelf(); } }
        void setBands(int topPx, int bottomPx) { if (topPx != topBand || bottomPx != bottomBand) { topBand = topPx; bottomBand = bottomPx; invalidateSelf(); } }
        @Override public void draw(Canvas canvas) {
            Rect b = getBounds();
            canvas.drawRect(b, top);                                   // top, sides and anything not yet covered
            if (bottomBand > 0) canvas.drawRect(b.left, b.bottom - bottomBand, b.right, b.bottom, bottom);
        }
        @Override public void setAlpha(int alpha) {}
        @Override public void setColorFilter(ColorFilter cf) {}
        @Override public int getOpacity() { return PixelFormat.OPAQUE; }
    }
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
        // android-1-1: only the TOP strip (and the sides) follow the surface; the bottom strip stays light.
        if (barsBackground != null) barsBackground.setTopColor(light ? Color.WHITE : getResources().getColor(R.color.hgHeaderNavy, getTheme()));
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
