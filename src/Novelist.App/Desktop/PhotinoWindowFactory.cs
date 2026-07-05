using System.Drawing;
using Novelist.Core.App;
using Photino.NET;

namespace Novelist.App.Desktop;

public sealed class PhotinoWindowFactory : IPhotinoWindowFactory
{
    public IPhotinoWindow Create(PhotinoWindowSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        var window = new PhotinoWindow();
        window.SetBrowserControlInitParameters("--disable-gpu --disable-gpu-compositing --disable-software-rasterizer=false");
        DesktopLaunchLog.Write("Photino browser init parameters configured.");
        var temporaryFilesPath = TryCreateWebViewDataPath();
        if (!string.IsNullOrWhiteSpace(temporaryFilesPath))
        {
            window.SetTemporaryFilesPath(temporaryFilesPath);
            DesktopLaunchLog.Write("Photino temporary files path: " + temporaryFilesPath);
        }
        else
        {
            DesktopLaunchLog.Write("Photino temporary files path not configured; using platform default.");
        }
        var adapter = new PhotinoWindowAdapter(window);
        var bridge = DesktopBridgeComposition.CreateBridge(adapter);

        window
            .SetTitle(settings.Title)
            .SetUseOsDefaultSize(false)
            .SetSize(new Size(settings.Width, settings.Height))
            .Center()
            .SetResizable(true)
            .RegisterWebMessageReceivedHandler((_, message) => bridge.Post(message))
            .Load(settings.StartUrl);

        return adapter;
    }

    private static string? TryCreateWebViewDataPath()
    {
        foreach (var path in CandidateWebViewDataPaths())
        {
            try
            {
                Directory.CreateDirectory(path);
                return path;
            }
            catch (Exception exception)
            {
                DesktopLaunchLog.Write("Unable to create WebView2 data path: " + path, exception);
            }
        }

        return null;
    }

    private static IEnumerable<string> CandidateWebViewDataPaths()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrWhiteSpace(localAppData))
        {
            yield return Path.Combine(localAppData, "Novelist", "WebView2");
        }

        yield return Path.Combine(Path.GetTempPath(), "Novelist", "WebView2");
    }

    private sealed class PhotinoWindowAdapter : IPhotinoWindow
    {
        private readonly PhotinoWindow _window;

        public PhotinoWindowAdapter(PhotinoWindow window)
        {
            _window = window;
        }

        public void WaitForClose()
        {
            _window.WaitForClose();
        }

        public void SendWebMessage(string message)
        {
            _window.SendWebMessage(message);
        }

        public async ValueTask<string?> ShowSaveFileAsync(
            string title,
            string defaultPath,
            IReadOnlyList<NovelExportFileFilter> filters,
            CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var photinoFilters = filters
                .Select(filter => (filter.DisplayName, new[] { filter.Pattern }))
                .ToArray();
            var path = await _window.ShowSaveFileAsync(title, defaultPath, photinoFilters);
            cancellationToken.ThrowIfCancellationRequested();
            return string.IsNullOrWhiteSpace(path) ? null : path;
        }

        public async ValueTask<string?> ShowOpenFileAsync(
            string title,
            string defaultPath,
            IReadOnlyList<WorkspaceFileFilter> filters,
            CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var photinoFilters = filters
                .Select(filter => (filter.DisplayName, filter.Patterns.ToArray()))
                .ToArray();
            var paths = await _window.ShowOpenFileAsync(title, defaultPath, false, photinoFilters);
            cancellationToken.ThrowIfCancellationRequested();
            return paths.FirstOrDefault(path => !string.IsNullOrWhiteSpace(path));
        }

        public void Minimize()
        {
            _window.Minimized = true;
        }

        public void ToggleMaximize()
        {
            _window.Maximized = !_window.Maximized;
        }

        public bool IsMaximized()
        {
            return _window.Maximized;
        }

        public void Close()
        {
            _window.Close();
        }
    }
}
