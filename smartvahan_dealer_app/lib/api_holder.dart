/// Shared API accessor for feature modules (avoids circular imports with main.dart).
class ApiHolder {
  static dynamic client;
  static Map<String, dynamic>? Function()? userGetter;

  static dynamic get api {
    if (client == null) {
      throw StateError('ApiHolder.client not initialized');
    }
    return client;
  }

  static Map<String, dynamic>? get user => userGetter?.call();

  static String resolveAssetUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http')) return path;
    const apiBase = String.fromEnvironment(
      'API_BASE',
      defaultValue: 'https://smartvahan.net/api',
    );
    final origin = apiBase.replaceAll(RegExp(r'/api/?$'), '');
    return '$origin${path.startsWith('/') ? path : '/$path'}';
  }
}
