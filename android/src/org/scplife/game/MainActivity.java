package org.scplife.game;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Full-screen landscape WebView that runs the offline SCP LIFE build from the APK assets.
 * The game and its assets (sounds, 3D models, textures) are served from a virtual https origin
 * (https://appassets.androidplatform.net/), because fetch() does not work on file:// URLs.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);              // saves live in localStorage
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new AssetClient());
        web.setBackgroundColor(0xff050607);
        setContentView(web);
        hideSystemBars();
        web.loadUrl("https://" + HOST + "/index.html");
    }

    /** Serves https://appassets.androidplatform.net/<path> from the APK assets folder. */
    private class AssetClient extends WebViewClient {
        private final Map<String, String> types = new HashMap<>();
        AssetClient() {
            types.put("html", "text/html"); types.put("js", "text/javascript"); types.put("json", "application/json");
            types.put("ogg", "audio/ogg"); types.put("glb", "model/gltf-binary"); types.put("jpg", "image/jpeg");
            types.put("png", "image/png"); types.put("css", "text/css"); types.put("txt", "text/plain");
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return serve(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return serve(Uri.parse(url));
        }

        private WebResourceResponse serve(Uri uri) {
            if (uri == null || !HOST.equals(uri.getHost())) return null;
            String path = uri.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            path = path.substring(1);
            if (path.contains("..")) return notFound();
            String ext = path.lastIndexOf('.') >= 0 ? path.substring(path.lastIndexOf('.') + 1).toLowerCase() : "";
            String mime = types.containsKey(ext) ? types.get(ext) : "application/octet-stream";
            try {
                InputStream in = getAssets().open(path);
                WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") || ext.equals("json") ? "utf-8" : null, in);
                Map<String, String> h = new HashMap<>();
                h.put("Access-Control-Allow-Origin", "*");
                h.put("Cache-Control", "no-cache");
                r.setResponseHeaders(h);
                return r;
            } catch (Exception e) {
                return notFound();
            }
        }

        private WebResourceResponse notFound() {
            WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", null);
            r.setStatusCodeAndReasonPhrase(404, "Not Found");
            return r;
        }
    }

    private void hideSystemBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) hideSystemBars();
    }

    /** The system Back button works like Esc in the game: closes windows, opens the pause menu. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));", null);
    }

    @Override
    protected void onPause() {
        web.evaluateJavascript("window.scpSave && window.scpSave();", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }
}
