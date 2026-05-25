export 'pdf_opener_stub.dart'
    if (dart.library.io) 'pdf_opener_io.dart'
    if (dart.library.html) 'pdf_opener_web.dart';
