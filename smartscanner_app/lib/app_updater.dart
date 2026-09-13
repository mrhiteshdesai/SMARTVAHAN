import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';

/// Returns true when [url] should be handled as a direct APK download (sideload),
/// not opened as a Play Store / App Store listing.
bool isDirectApkUpdateUrl(String? url) {
  final raw = (url ?? '').trim();
  if (raw.isEmpty) return false;
  if (kIsWeb) return false;
  if (defaultTargetPlatform != TargetPlatform.android) return false;

  final u = raw.toLowerCase();
  if (u.contains('play.google.com') ||
      u.contains('apps.apple.com') ||
      u.contains('appgallery.huawei') ||
      u.contains('market://')) {
    return false;
  }
  if (u.endsWith('.apk') || u.contains('.apk?') || u.contains('.apk#')) {
    return true;
  }
  // Sideload phase: any non-store https URL on Android is treated as APK host.
  return u.startsWith('http://') || u.startsWith('https://');
}

Future<void> openExternalUpdateUrl(String url) async {
  final uri = Uri.tryParse(url.trim());
  if (uri == null) return;
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

/// Full-screen style dialog: confirm → download with progress → confirm install → open installer.
Future<void> runInAppApkUpdateFlow({
  required BuildContext context,
  required String apkUrl,
  String appLabel = 'SMARTVAHAN',
}) async {
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => _ApkUpdateDialog(apkUrl: apkUrl.trim(), appLabel: appLabel),
  );
}

enum _UpdatePhase {
  confirmDownload,
  downloading,
  confirmInstall,
  installing,
  error,
}

class _ApkUpdateDialog extends StatefulWidget {
  final String apkUrl;
  final String appLabel;

  const _ApkUpdateDialog({required this.apkUrl, required this.appLabel});

  @override
  State<_ApkUpdateDialog> createState() => _ApkUpdateDialogState();
}

class _ApkUpdateDialogState extends State<_ApkUpdateDialog> {
  _UpdatePhase _phase = _UpdatePhase.confirmDownload;
  double _progress = 0;
  String _status = '';
  String? _error;
  String? _apkPath;
  CancelToken? _cancelToken;
  bool _busy = false;

  @override
  void dispose() {
    _cancelToken?.cancel('disposed');
    super.dispose();
  }

  Future<bool> _ensureInstallPermission() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return false;
    var status = await Permission.requestInstallPackages.status;
    if (status.isGranted) return true;
    status = await Permission.requestInstallPackages.request();
    if (status.isGranted) return true;
    if (status.isPermanentlyDenied) {
      await openAppSettings();
    }
    return false;
  }

  Future<void> _startDownload() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _phase = _UpdatePhase.downloading;
      _progress = 0;
      _status = 'Preparing download…';
      _error = null;
    });

    try {
      final dir = await getTemporaryDirectory();
      final fileName =
          'update_${DateTime.now().millisecondsSinceEpoch}.apk';
      final savePath = '${dir.path}${Platform.pathSeparator}$fileName';

      _cancelToken = CancelToken();
      final dio = Dio(
        BaseOptions(
          connectTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(minutes: 10),
          followRedirects: true,
          validateStatus: (s) => s != null && s >= 200 && s < 400,
        ),
      );

      await dio.download(
        widget.apkUrl,
        savePath,
        cancelToken: _cancelToken,
        onReceiveProgress: (received, total) {
          if (!mounted) return;
          if (total > 0) {
            setState(() {
              _progress = received / total;
              final mb = (received / (1024 * 1024)).toStringAsFixed(1);
              final totalMb = (total / (1024 * 1024)).toStringAsFixed(1);
              _status = 'Downloading… $mb / $totalMb MB';
            });
          } else {
            setState(() {
              _progress = 0;
              final mb = (received / (1024 * 1024)).toStringAsFixed(1);
              _status = 'Downloading… $mb MB';
            });
          }
        },
        options: Options(
          responseType: ResponseType.bytes,
          headers: {'Accept': '*/*'},
        ),
      );

      final file = File(savePath);
      if (!await file.exists() || await file.length() < 1024) {
        throw Exception('Downloaded file is empty or too small. Check the APK URL.');
      }

      // APK is a ZIP; check PK magic bytes
      final raf = await file.open();
      final header = await raf.read(2);
      await raf.close();
      if (header.length < 2 || header[0] != 0x50 || header[1] != 0x4B) {
        throw Exception(
          'The download does not look like an APK. Use a direct .apk link (not an HTML page).',
        );
      }

      if (!mounted) return;
      setState(() {
        _apkPath = savePath;
        _phase = _UpdatePhase.confirmInstall;
        _progress = 1;
        _status = 'Download complete';
        _busy = false;
      });
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) return;
      if (!mounted) return;
      setState(() {
        _phase = _UpdatePhase.error;
        _error = e.message ?? 'Download failed';
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _UpdatePhase.error;
        _error = e.toString();
        _busy = false;
      });
    }
  }

  Future<void> _install() async {
    if (_busy || _apkPath == null) return;
    setState(() {
      _busy = true;
      _phase = _UpdatePhase.installing;
      _status = 'Checking install permission…';
      _error = null;
    });

    final allowed = await _ensureInstallPermission();
    if (!allowed) {
      if (!mounted) return;
      setState(() {
        _phase = _UpdatePhase.error;
        _error =
            'Install permission denied. Enable “Install unknown apps” for ${widget.appLabel} in system settings, then try again.';
        _busy = false;
      });
      return;
    }

    if (!mounted) return;
    setState(() => _status = 'Opening Android installer…');

    final result = await OpenFilex.open(_apkPath!, type: 'application/vnd.android.package-archive');
    if (!mounted) return;

    if (result.type != ResultType.done) {
      setState(() {
        _phase = _UpdatePhase.error;
        _error = result.message.isNotEmpty
            ? result.message
            : 'Could not open the installer. Try again or install the APK manually.';
        _busy = false;
      });
      return;
    }

    setState(() {
      _status =
          'Installer opened. Confirm the update on the next Android screen. The app will close and relaunch after you install.';
      _busy = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_busy && _phase != _UpdatePhase.downloading,
      child: AlertDialog(
        title: Text('Update ${widget.appLabel}'),
        content: SizedBox(
          width: 340,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_phase == _UpdatePhase.confirmDownload) ...[
                const Text(
                  'A new version is required. Download the APK from the configured URL and install it on this device?',
                ),
                const SizedBox(height: 12),
                Text(
                  widget.apkUrl,
                  style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              if (_phase == _UpdatePhase.downloading) ...[
                Text(_status.isEmpty ? 'Downloading…' : _status),
                const SizedBox(height: 16),
                LinearProgressIndicator(
                  value: _progress > 0 ? _progress : null,
                  minHeight: 8,
                  borderRadius: BorderRadius.circular(4),
                ),
                const SizedBox(height: 8),
                Text(
                  _progress > 0 ? '${(_progress * 100).toStringAsFixed(0)}%' : 'Starting…',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ],
              if (_phase == _UpdatePhase.confirmInstall) ...[
                const Text(
                  'Download finished. Install the update now? Android will ask you to confirm.',
                ),
                const SizedBox(height: 8),
                Text(_status, style: const TextStyle(fontSize: 12, color: Color(0xFF166534))),
              ],
              if (_phase == _UpdatePhase.installing) ...[
                Text(_status.isEmpty ? 'Installing…' : _status),
                const SizedBox(height: 16),
                const LinearProgressIndicator(minHeight: 8),
              ],
              if (_phase == _UpdatePhase.error) ...[
                Text(
                  _error ?? 'Update failed',
                  style: const TextStyle(color: Color(0xFFB91C1C)),
                ),
              ],
            ],
          ),
        ),
        actions: [
          if (_phase == _UpdatePhase.confirmDownload) ...[
            TextButton(
              onPressed: _busy ? null : () => Navigator.of(context).pop(),
              child: const Text('Later'),
            ),
            FilledButton(
              onPressed: _busy ? null : _startDownload,
              child: const Text('Download update'),
            ),
          ],
          if (_phase == _UpdatePhase.downloading)
            TextButton(
              onPressed: () {
                _cancelToken?.cancel('user');
                Navigator.of(context).pop();
              },
              child: const Text('Cancel'),
            ),
          if (_phase == _UpdatePhase.confirmInstall) ...[
            TextButton(
              onPressed: _busy ? null : () => Navigator.of(context).pop(),
              child: const Text('Later'),
            ),
            FilledButton(
              onPressed: _busy ? null : _install,
              child: const Text('Install update'),
            ),
          ],
          if (_phase == _UpdatePhase.installing)
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Close'),
            ),
          if (_phase == _UpdatePhase.error) ...[
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Close'),
            ),
            FilledButton(
              onPressed: _busy
                  ? null
                  : () {
                      setState(() {
                        _phase = _UpdatePhase.confirmDownload;
                        _error = null;
                      });
                    },
              child: const Text('Retry'),
            ),
          ],
        ],
      ),
    );
  }
}
