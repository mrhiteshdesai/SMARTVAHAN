import 'dart:io';

import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

Future<void> openPdfFromUrl(String url, {String? filenameHint}) async {
  try {
    if (url.startsWith('http')) {
      final dio = Dio();
      final response = await dio.get<List<int>>(
        url,
        options: Options(responseType: ResponseType.bytes),
      );
      final data = response.data;
      if (data == null || data.isEmpty) {
        return;
      }
      final dir = await getTemporaryDirectory();
      final name = (filenameHint == null || filenameHint.trim().isEmpty)
          ? 'smartvahan_certificate'
          : filenameHint.trim();
      final file = File(
        '${dir.path}/${name}_${DateTime.now().millisecondsSinceEpoch}.pdf',
      );
      await file.writeAsBytes(data, flush: true);
      await OpenFilex.open(file.path, type: 'application/pdf');
      return;
    }
    await OpenFilex.open(url, type: 'application/pdf');
  } catch (_) {}
}
