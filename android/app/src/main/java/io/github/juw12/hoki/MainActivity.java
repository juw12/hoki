package io.github.juw12.hoki;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;

/**
 * Opening the app shows the full 3D Hoki app, bundled inside the APK so it works offline.
 * Files are served from assets/www on a secure https origin (appassets.androidplatform.net),
 * which ES modules and localStorage need; nothing is fetched from the network.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        web.setWebViewClient(new AssetClient());
        setContentView(web);
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    private class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) {
                return null;
            }
            String path = url.getPath();
            if (path == null || !path.startsWith("/www/") || path.contains("..")) {
                return null;
            }
            String asset = path.substring(1);
            if (asset.endsWith("/")) {
                asset += "index.html";
            }
            try {
                InputStream stream = getAssets().open(asset);
                String mime = mimeOf(asset);
                String encoding = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("svg+xml") ? "utf-8" : null;
                return new WebResourceResponse(mime, encoding, stream);
            } catch (IOException missing) {
                WebResourceResponse notFound = new WebResourceResponse("text/plain", "utf-8", null);
                notFound.setStatusCodeAndReasonPhrase(404, "Not Found");
                return notFound;
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Links that leave the bundled app (GitHub, downloads) open in the browser.
            if (HOST.equals(request.getUrl().getHost())) {
                return false;
            }
            try {
                startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, request.getUrl()));
            } catch (android.content.ActivityNotFoundException ignored) {
                // No browser installed: stay put.
            }
            return true;
        }
    }

    private static String mimeOf(String name) {
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js") || name.endsWith(".mjs")) return "text/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".json") || name.endsWith(".webmanifest")) return "application/json";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".ico")) return "image/x-icon";
        if (name.endsWith(".mp3")) return "audio/mpeg";
        if (name.endsWith(".ogg")) return "audio/ogg";
        if (name.endsWith(".wav")) return "audio/wav";
        if (name.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }
}
