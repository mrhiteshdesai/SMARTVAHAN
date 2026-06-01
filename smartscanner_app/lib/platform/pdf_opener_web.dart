import 'package:url_launcher/url_launcher.dart';

Future<void> openPdfFromUrl(String url, {String? filenameHint}) async {
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  try {
    await launchUrl(uri, mode: LaunchMode.platformDefault);
  } catch (_) {}
}
