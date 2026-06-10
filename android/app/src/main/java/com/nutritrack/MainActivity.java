package com.nutritrack;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private File pendingPhotoFile;
    private String pendingExportJson;

    private ActivityResultLauncher<Uri> cameraLauncher;
    private ActivityResultLauncher<String> galleryLauncher;
    private ActivityResultLauncher<String> createFileLauncher;
    private ActivityResultLauncher<String[]> openFileLauncher;
    private ActivityResultLauncher<String> cameraPermissionLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        setupWebView();
        registerLaunchers();

        webView.loadUrl("file:///android_asset/index.html");
    }

    // ── WebView setup ──────────────────────────────────────────────────────
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // powers localStorage
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        WebView.setWebContentsDebuggingEnabled(false);
    }

    // ── Activity result launchers ──────────────────────────────────────────
    private void registerLaunchers() {

        // Camera — takes photo and saves to pendingPhotoFile
        cameraLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingPhotoFile != null) {
                    runOcr(pendingPhotoFile);
                } else {
                    jsCall("window.onOcrError('Camera cancelled')");
                }
            }
        );

        // Gallery — picks image, copies to cache, then OCR
        galleryLauncher = registerForActivityResult(
            new ActivityResultContracts.GetContent(),
            uri -> {
                if (uri == null) { jsCall("window.onOcrError('No image selected')"); return; }
                try {
                    File dest = createTempImage();
                    try (InputStream in  = getContentResolver().openInputStream(uri);
                         FileOutputStream out = new FileOutputStream(dest)) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                    }
                    runOcr(dest);
                } catch (IOException e) {
                    jsCall("window.onOcrError('Failed to load image')");
                }
            }
        );

        // Export — SAF "create document" dialog
        createFileLauncher = registerForActivityResult(
            new ActivityResultContracts.CreateDocument("application/json"),
            uri -> {
                if (uri == null || pendingExportJson == null) return;
                try (FileOutputStream out = (FileOutputStream)
                        getContentResolver().openOutputStream(uri)) {
                    out.write(pendingExportJson.getBytes());
                    pendingExportJson = null;
                    runOnUiThread(() -> Toast.makeText(this, "✓ Data exported", Toast.LENGTH_SHORT).show());
                } catch (IOException e) {
                    runOnUiThread(() -> Toast.makeText(this, "Export failed: " + e.getMessage(), Toast.LENGTH_SHORT).show());
                }
            }
        );

        // Import — SAF "open document" dialog
        openFileLauncher = registerForActivityResult(
            new ActivityResultContracts.OpenDocument(),
            uri -> {
                if (uri == null) return;
                try (InputStream in = getContentResolver().openInputStream(uri);
                     BufferedReader reader = new BufferedReader(new InputStreamReader(in))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    String escaped = escapeForJs(sb.toString());
                    jsCall("window.receiveImportedData('" + escaped + "')");
                } catch (IOException e) {
                    runOnUiThread(() -> Toast.makeText(this, "Import failed", Toast.LENGTH_SHORT).show());
                }
            }
        );

        // Camera permission request
        cameraPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> {
                if (granted) launchCamera();
                else runOnUiThread(() -> Toast.makeText(this, "Camera permission required", Toast.LENGTH_SHORT).show());
            }
        );
    }

    // ── OCR via ML Kit ─────────────────────────────────────────────────────
    private void runOcr(File imageFile) {
        try {
            InputImage image = InputImage.fromFilePath(this, Uri.fromFile(imageFile));
            TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            recognizer.process(image)
                .addOnSuccessListener(result -> {
                    String raw = result.getText();
                    jsCall("window.receiveOcrText('" + escapeForJs(raw) + "')");
                })
                .addOnFailureListener(e ->
                    jsCall("window.onOcrError('" + escapeForJs(e.getMessage()) + "')")
                );
        } catch (IOException e) {
            jsCall("window.onOcrError('Could not process image')");
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    private void jsCall(String expression) {
        runOnUiThread(() -> webView.evaluateJavascript(expression, null));
    }

    private File createTempImage() throws IOException {
        String ts = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        return File.createTempFile("IMG_" + ts, ".jpg", getCacheDir());
    }

    private void launchCamera() {
        try {
            pendingPhotoFile = createTempImage();
            Uri photoUri = FileProvider.getUriForFile(this,
                getPackageName() + ".fileprovider", pendingPhotoFile);
            cameraLauncher.launch(photoUri);
        } catch (IOException e) {
            jsCall("window.onOcrError('Could not start camera')");
        }
    }

    private static String escapeForJs(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("'",  "\\'")
                .replace("\r", "")
                .replace("\n", "\\n");
    }

    // ── JavaScript ↔ Android bridge ────────────────────────────────────────
    class AndroidBridge {

        /** Called from JS scan page — opens camera, triggers OCR on result */
        @JavascriptInterface
        public void startOcrCapture() {
            runOnUiThread(() -> {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                    launchCamera();
                } else {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
                }
            });
        }

        /** Pick from gallery instead of live camera */
        @JavascriptInterface
        public void pickFromGallery() {
            runOnUiThread(() -> galleryLauncher.launch("image/*"));
        }

        /** Export all data as JSON — shows system file-save dialog */
        @JavascriptInterface
        public void exportData(String jsonData) {
            pendingExportJson = jsonData;
            String name = "nutritrack_"
                + new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date())
                + ".json";
            runOnUiThread(() -> createFileLauncher.launch(name));
        }

        /** Open system file-picker to import a previously exported JSON */
        @JavascriptInterface
        public void importData() {
            runOnUiThread(() -> openFileLauncher.launch(new String[]{"application/json", "*/*"}));
        }
    }

    // ── Back button: navigate within WebView first ─────────────────────────
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
