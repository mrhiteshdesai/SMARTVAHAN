import 'dart:async';
import 'dart:convert';

import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:image/image.dart' as img;
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'platform/pdf_opener.dart';

final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

class AppMeta {
  static String platform = '';
  static String versionName = '';
  static String buildNumber = '';

  static Future<void> init() async {
    try {
      final info = await PackageInfo.fromPlatform();
      versionName = info.version;
      buildNumber = info.buildNumber;
    } catch (_) {
      versionName = '';
      buildNumber = '';
    }
    if (kIsWeb) {
      platform = 'web';
      return;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        platform = 'android';
        break;
      case TargetPlatform.iOS:
        platform = 'ios';
        break;
      case TargetPlatform.windows:
        platform = 'windows';
        break;
      case TargetPlatform.macOS:
        platform = 'macos';
        break;
      case TargetPlatform.linux:
        platform = 'linux';
        break;
      case TargetPlatform.fuchsia:
        platform = 'fuchsia';
        break;
    }
  }
}

bool _updateDialogOpen = false;

Future<void> showUpdateRequiredDialog({
  required String message,
  String? storeUrl,
}) async {
  if (_updateDialogOpen) return;
  final ctx =
      rootNavigatorKey.currentState?.overlay?.context ??
      rootNavigatorKey.currentContext;
  if (ctx == null) return;
  _updateDialogOpen = true;
  try {
    await showDialog<void>(
      context: ctx,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Update Required'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () async {
              final url = (storeUrl ?? '').trim();
              if (url.isNotEmpty) {
                await launchUrl(
                  Uri.parse(url),
                  mode: LaunchMode.externalApplication,
                );
              }
            },
            child: const Text('Update App'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  } finally {
    _updateDialogOpen = false;
  }
}

bool _geofenceDialogOpen = false;

Future<void> showGeofenceBlockedDialog({
  required String message,
  double? allowedKm,
  double? distanceKm,
}) async {
  if (_geofenceDialogOpen) return;
  final ctx =
      rootNavigatorKey.currentState?.overlay?.context ??
      rootNavigatorKey.currentContext;
  if (ctx == null) return;
  _geofenceDialogOpen = true;
  String details = message;
  final a = allowedKm;
  final d = distanceKm;
  if (a != null && d != null) {
    details =
        '$message\n\nDistance: ${d.toStringAsFixed(2)} KM\nAllowed: ${a.toStringAsFixed(2)} KM';
  }
  try {
    await showDialog<void>(
      context: ctx,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Outside Allowed Area'),
        content: Text(details),
        actions: [
          TextButton(
            onPressed: () async {
              await Geolocator.openLocationSettings();
            },
            child: const Text('Location Settings'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  } finally {
    _geofenceDialogOpen = false;
  }
}

class OutwardCurveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    var path = Path();
    path.lineTo(0, size.height - 80);
    path.quadraticBezierTo(
      size.width / 2,
      size.height,
      size.width,
      size.height - 80,
    );
    path.lineTo(size.width, 0);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(CustomClipper<Path> oldClipper) => false;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppMeta.init();
  runApp(const SmartvahanApp());
}

class LookupService {
  static List<dynamic>? vehicleCategories;
  static final Map<String, List<dynamic>> _rtosCache = {};
  static final Map<String, List<dynamic>> _passingRtosCache = {};
  static const _keyRtosPrefix = 'cache_rtos_';
  static const _keyRtosMetaPrefix = 'cache_rtos_meta_';
  static const _keyPassingRtosPrefix = 'cache_passing_rtos_';
  static const _keyPassingRtosMetaPrefix = 'cache_passing_rtos_meta_';
  static const _cacheTtlMs = 24 * 60 * 60 * 1000;

  static bool _isExpired(int cachedAtMs) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (now - cachedAtMs) > _cacheTtlMs;
  }

  static Future<void> hydrateLookups(
    String? stateCode, {
    String? dealerVersion,
  }) async {
    if (stateCode == null || stateCode.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();

    final rtosMetaStr = prefs.getString('$_keyRtosMetaPrefix$stateCode');
    final rtosStr = prefs.getString('$_keyRtosPrefix$stateCode');
    if (_rtosCache[stateCode] == null &&
        rtosMetaStr != null &&
        rtosStr != null) {
      try {
        final meta = jsonDecode(rtosMetaStr) as Map<String, dynamic>;
        final cachedAt = (meta['cachedAt'] as num?)?.toInt() ?? 0;
        if (cachedAt > 0 && !_isExpired(cachedAt)) {
          final decoded = jsonDecode(rtosStr);
          if (decoded is List) {
            _rtosCache[stateCode] = List<dynamic>.from(decoded);
          }
        } else {
          await prefs.remove('$_keyRtosMetaPrefix$stateCode');
          await prefs.remove('$_keyRtosPrefix$stateCode');
        }
      } catch (_) {
        await prefs.remove('$_keyRtosMetaPrefix$stateCode');
        await prefs.remove('$_keyRtosPrefix$stateCode');
      }
    }

    final passingMetaStr = prefs.getString(
      '$_keyPassingRtosMetaPrefix$stateCode',
    );
    final passingStr = prefs.getString('$_keyPassingRtosPrefix$stateCode');
    if (_passingRtosCache[stateCode] == null &&
        passingMetaStr != null &&
        passingStr != null) {
      try {
        final meta = jsonDecode(passingMetaStr) as Map<String, dynamic>;
        final cachedAt = (meta['cachedAt'] as num?)?.toInt() ?? 0;
        final cachedDealerVersion = meta['dealerVersion']?.toString();
        final validDealerVersion =
            dealerVersion == null ||
            dealerVersion.isEmpty ||
            cachedDealerVersion == dealerVersion;
        if (cachedAt > 0 && !_isExpired(cachedAt) && validDealerVersion) {
          final decoded = jsonDecode(passingStr);
          if (decoded is List) {
            _passingRtosCache[stateCode] = List<dynamic>.from(decoded);
          }
        } else {
          await prefs.remove('$_keyPassingRtosMetaPrefix$stateCode');
          await prefs.remove('$_keyPassingRtosPrefix$stateCode');
        }
      } catch (_) {
        await prefs.remove('$_keyPassingRtosMetaPrefix$stateCode');
        await prefs.remove('$_keyPassingRtosPrefix$stateCode');
      }
    }
  }

  static List<dynamic>? getRtos(String? stateCode) {
    if (stateCode == null || stateCode.isEmpty) return [];
    return _rtosCache[stateCode];
  }

  static Future<void> cacheRtos(String? stateCode, List<dynamic> data) async {
    if (stateCode != null && stateCode.isNotEmpty) {
      _rtosCache[stateCode] = data;
      final prefs = await SharedPreferences.getInstance();
      final now = DateTime.now().millisecondsSinceEpoch;
      await prefs.setString('$_keyRtosPrefix$stateCode', jsonEncode(data));
      await prefs.setString(
        '$_keyRtosMetaPrefix$stateCode',
        jsonEncode({'cachedAt': now}),
      );
    }
  }

  static List<dynamic>? getPassingRtos(String? stateCode) {
    if (stateCode == null || stateCode.isEmpty) return [];
    return _passingRtosCache[stateCode];
  }

  static Future<void> cachePassingRtos(
    String? stateCode,
    List<dynamic> data, {
    String? dealerVersion,
  }) async {
    if (stateCode != null && stateCode.isNotEmpty) {
      _passingRtosCache[stateCode] = data;
      final prefs = await SharedPreferences.getInstance();
      final now = DateTime.now().millisecondsSinceEpoch;
      await prefs.setString(
        '$_keyPassingRtosPrefix$stateCode',
        jsonEncode(data),
      );
      await prefs.setString(
        '$_keyPassingRtosMetaPrefix$stateCode',
        jsonEncode({'cachedAt': now, 'dealerVersion': dealerVersion}),
      );
    }
  }

  static Future<void> invalidatePassingRtosCache() async {
    _passingRtosCache.clear();
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys();
    for (final k in keys) {
      if (k.startsWith(_keyPassingRtosPrefix) ||
          k.startsWith(_keyPassingRtosMetaPrefix)) {
        await prefs.remove(k);
      }
    }
  }

  static const _draftPrefix = 'draft_';
  static const _keyActiveSession = 'active_session_qr';

  static Future<void> saveDraft(
    String qrValue,
    Map<String, dynamic> data,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_draftPrefix$qrValue', jsonEncode(data));
  }

  static Future<Map<String, dynamic>?> getDraft(String qrValue) async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString('$_draftPrefix$qrValue');
    if (str == null) return null;
    try {
      return jsonDecode(str) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<void> clearDraft(String qrValue) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$_draftPrefix$qrValue');
  }

  static Future<void> saveActiveSession(Map<String, dynamic> qrArgs) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyActiveSession, jsonEncode(qrArgs));
  }

  static Future<Map<String, dynamic>?> getActiveSession() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString(_keyActiveSession);
    if (str == null) return null;
    try {
      return jsonDecode(str) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<void> clearActiveSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyActiveSession);
  }
}

class ApiSession {
  static String? token;
  static Map<String, dynamic>? user;

  static const _keyToken = 'auth_token';
  static const _keyUser = 'auth_user';

  static Future<void> saveToStorage() async {
    final prefs = await SharedPreferences.getInstance();
    if (token == null || token!.isEmpty || user == null) {
      await prefs.remove(_keyToken);
      await prefs.remove(_keyUser);
      return;
    }
    await prefs.setString(_keyToken, token!);
    await prefs.setString(_keyUser, jsonEncode(user));
  }

  static Future<bool> loadFromStorage() async {
    final prefs = await SharedPreferences.getInstance();
    final storedToken = prefs.getString(_keyToken);
    final storedUser = prefs.getString(_keyUser);
    if (storedToken == null ||
        storedToken.isEmpty ||
        storedUser == null ||
        storedUser.isEmpty) {
      token = null;
      user = null;
      return false;
    }
    try {
      final decoded = jsonDecode(storedUser) as Map<String, dynamic>;
      token = storedToken;
      user = decoded;
      return true;
    } catch (_) {
      token = null;
      user = null;
      return false;
    }
  }

  static Future<void> clearStorage() async {
    token = null;
    user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyToken);
    await prefs.remove(_keyUser);
  }
}

class ApiClient {
  final Dio _dio = Dio(
    BaseOptions(
      baseUrl: 'https://smartvahan.net/api',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
    ),
  );

  ApiClient() {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final t = ApiSession.token;
          if (t != null && t.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $t';
          }
          if (AppMeta.platform.isNotEmpty) {
            options.headers['X-App-Platform'] = AppMeta.platform;
          }
          if (AppMeta.versionName.isNotEmpty) {
            options.headers['X-App-Version'] = AppMeta.versionName;
          }
          if (AppMeta.buildNumber.isNotEmpty) {
            options.headers['X-App-Build'] = AppMeta.buildNumber;
          }
          handler.next(options);
        },
        onError: (e, handler) async {
          final resp = e.response;
          if (resp != null && resp.statusCode == 426) {
            String message =
                'Update required. Please update the SMARTVAHAN app to continue.';
            String? storeUrl;
            final data = resp.data;
            if (data is Map) {
              if (data['message'] != null) {
                message = data['message'].toString();
              }
              if (data['storeUrl'] != null) {
                storeUrl = data['storeUrl']?.toString();
              }
            }
            await showUpdateRequiredDialog(
              message: message,
              storeUrl: storeUrl,
            );
          } else if (resp != null && resp.statusCode == 403) {
            final data = resp.data;
            if (data is Map && data['code']?.toString() == 'GEOFENCE_OUTSIDE') {
              final msg =
                  data['message']?.toString() ??
                  'Outside allowed working radius.';
              final allowed = data['allowedKm'];
              final distance = data['distanceKm'];
              final allowedKm = allowed is num
                  ? allowed.toDouble()
                  : double.tryParse('$allowed');
              final distanceKm = distance is num
                  ? distance.toDouble()
                  : double.tryParse('$distance');
              await showGeofenceBlockedDialog(
                message: msg,
                allowedKm: allowedKm,
                distanceKm: distanceKm,
              );
            }
          }
          handler.next(e);
        },
      ),
    );
  }

  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.get(path, queryParameters: queryParameters);
  }

  Future<Response<dynamic>> post(String path, {dynamic data}) {
    return _dio.post(path, data: data);
  }
}

final api = ApiClient();

class DealerBottomNav extends StatelessWidget {
  final int currentIndex;

  const DealerBottomNav({super.key, required this.currentIndex});

  Widget _navIcon(IconData icon, bool selected) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: selected
            ? const Color(0xFF12314D).withOpacity(0.12)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(
        icon,
        color: selected ? const Color(0xFF12314D) : const Color(0xFF91A8BD),
      ),
    );
  }

  void _go(BuildContext context, int idx) {
    final routes = <int, String>{
      0: '/home',
      1: '/history',
      2: '/profile',
      3: '/support',
    };
    final target = routes[idx];
    if (target == null) return;
    Navigator.of(context).pushNamedAndRemoveUntil(target, (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return BottomNavigationBar(
      currentIndex: currentIndex,
      type: BottomNavigationBarType.fixed,
      selectedItemColor: const Color(0xFF12314D),
      unselectedItemColor: const Color(0xFF91A8BD),
      onTap: (i) => _go(context, i),
      items: [
        BottomNavigationBarItem(
          icon: _navIcon(LucideIcons.house, currentIndex == 0),
          label: 'Home',
        ),
        BottomNavigationBarItem(
          icon: _navIcon(LucideIcons.history, currentIndex == 1),
          label: 'My Certificates',
        ),
        BottomNavigationBarItem(
          icon: _navIcon(LucideIcons.user, currentIndex == 2),
          label: 'Profile',
        ),
        BottomNavigationBarItem(
          icon: _navIcon(LucideIcons.headset, currentIndex == 3),
          label: 'Support',
        ),
      ],
    );
  }
}

class SmartvahanApp extends StatelessWidget {
  const SmartvahanApp({super.key});

  @override
  Widget build(BuildContext context) {
    final baseTheme = ThemeData(
      fontFamily: 'Poppins',
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF12314D),
        primary: const Color(0xFF12314D),
        secondary: const Color(0xFFF13546),
      ),
      useMaterial3: true,
    );

    return MaterialApp(
      title: 'SMARTVAHAN Dealer',
      navigatorKey: rootNavigatorKey,
      theme: baseTheme.copyWith(scaffoldBackgroundColor: Colors.white),
      debugShowCheckedModeBanner: false,
      initialRoute: '/splash',
      routes: {
        '/splash': (_) => const SplashScreen(),
        '/login': (_) => const LoginScreen(),
        '/home': (_) => const HomeScreen(),
        '/scan': (_) => const ScanScreen(),
        '/form': (_) => const FormScreen(),
        '/history': (_) => const HistoryScreen(),
        '/profile': (_) => const ProfileScreen(),
        '/support': (_) => const SupportScreen(),
        '/success': (_) => const CertificateSuccessScreen(),
      },
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  Timer? _timer;
  bool _checkingSession = true;

  @override
  void initState() {
    super.initState();
    _initSession();
  }

  Future<void> _initSession() async {
    final hasSession = await ApiSession.loadFromStorage();
    if (!mounted) return;
    setState(() {
      _checkingSession = false;
    });

    if (hasSession) {
      final activeSession = await LookupService.getActiveSession();
      if (!mounted) return;
      Navigator.of(
        context,
      ).pushNamedAndRemoveUntil('/home', (Route<dynamic> route) => false);
      if (activeSession != null) {
        Navigator.of(context).pushNamed('/form', arguments: activeSession);
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Scaffold(
      body: Stack(
        children: [
          // Global Background Image
          Positioned.fill(
            child: Image.asset(
              'assets/background.png',
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) {
                return Container(color: Colors.white);
              },
            ),
          ),
          Column(
            children: [
              SizedBox(
                height: size.height * 0.75,
                child: ClipPath(
                  clipper: OutwardCurveClipper(),
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFF162F45), Color(0xFF00417B)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                    width: double.infinity,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 60.0),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Image.asset(
                            'assets/logo.png',
                            width: size.width * 0.7 > 300
                                ? 300
                                : size.width * 0.7,
                            height: size.width * 0.7 > 300
                                ? 300
                                : size.width * 0.7,
                            fit: BoxFit.contain,
                            errorBuilder: (context, error, stackTrace) {
                              return const Icon(
                                LucideIcons.car,
                                color: Colors.white,
                                size: 120,
                              );
                            },
                          ),
                          const Text(
                            'Hello!',
                            style: TextStyle(
                              fontFamily: 'Poppins',
                              fontWeight: FontWeight.w300,
                              color: Colors.white,
                              fontSize: 34,
                            ),
                          ),
                          const Text(
                            'Welcome To',
                            style: TextStyle(
                              fontFamily: 'Poppins',
                              fontWeight: FontWeight.w300,
                              color: Colors.white,
                              fontSize: 34,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'SMARTVAHAN',
                            style: TextStyle(
                              fontFamily: 'Poppins',
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              fontSize: 44,
                              letterSpacing: 2,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Secure access for authorized dealers only.',
                            style: TextStyle(
                              color: Color(0xFF91A8BD),
                              fontWeight: FontWeight.w500,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24.0),
                        child: ElevatedButton(
                          onPressed: () {
                            Navigator.of(context).pushNamed('/login');
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFF13546),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            elevation: 4,
                            padding: EdgeInsets.zero,
                          ),
                          child: const Text(
                            'Get Started!',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    GestureDetector(
                      onTap: () async {
                        final Uri url = Uri.parse(
                          'https://smartvahan.net/dealer-registration',
                        );
                        if (await canLaunchUrl(url)) {
                          await launchUrl(
                            url,
                            mode: LaunchMode.externalApplication,
                          );
                        }
                      },
                      child: const Column(
                        children: [
                          Text(
                            'If you are not an authorized dealer,',
                            style: TextStyle(
                              color: Colors.black,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Click here to register!',
                            style: TextStyle(
                              color: Color(0xFFF13546),
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final phone = _phoneController.text.trim();
    final password = _passwordController.text.trim();

    setState(() {
      _loading = true;
      _error = null;
    });

    if (phone.length != 10 || password.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Enter valid 10 digit phone and password';
      });
      return;
    }

    try {
      final res = await api.post(
        '/auth/login',
        data: {'phone': phone, 'password': password},
      );
      final data = res.data as Map;
      final token = data['accessToken'] as String?;
      final user = data['user'] as Map?;
      if (token == null || user == null) {
        setState(() {
          _loading = false;
          _error = 'Invalid response from server';
        });
        return;
      }
      ApiSession.token = token;
      ApiSession.user = Map<String, dynamic>.from(user);
      await ApiSession.saveToStorage();
      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed('/home');
      setState(() {
        _loading = false;
      });
    } on DioException catch (e) {
      String message = 'Login failed';
      final resp = e.response;
      if (resp != null && resp.data is Map && resp.data['message'] != null) {
        message = resp.data['message'].toString();
      }
      setState(() {
        _loading = false;
        _error = message;
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _error = 'Network error, please try again';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Scaffold(
      body: Stack(
        children: [
          // Global Background Image
          Positioned.fill(
            child: Image.asset(
              'assets/background.png',
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) {
                return Container(color: Colors.white);
              },
            ),
          ),
          SingleChildScrollView(
            child: SizedBox(
              height: size.height,
              child: Column(
                children: [
                  SizedBox(
                    height: size.height * 0.60,
                    child: ClipPath(
                      clipper: OutwardCurveClipper(),
                      child: Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            colors: [Color(0xFF162F45), Color(0xFF00417B)],
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                          ),
                        ),
                        width: double.infinity,
                        child: Padding(
                          padding: const EdgeInsets.only(bottom: 60.0),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Image.asset(
                                'assets/logo.png',
                                width: size.width * 0.6 > 240
                                    ? 240
                                    : size.width * 0.6,
                                height: size.width * 0.6 > 240
                                    ? 240
                                    : size.width * 0.6,
                                fit: BoxFit.contain,
                                errorBuilder: (context, error, stackTrace) {
                                  return const Icon(
                                    LucideIcons.car,
                                    color: Colors.white,
                                    size: 120,
                                  );
                                },
                              ),
                              Transform.translate(
                                offset: const Offset(0, -10),
                                child: const Text(
                                  'Secure access for authorized dealers only.',
                                  style: TextStyle(
                                    color: Color(0xFF91A8BD),
                                    fontWeight: FontWeight.w500,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Column(
                            children: [
                              Container(
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withOpacity(0.1),
                                      spreadRadius: 4,
                                      blurRadius: 16,
                                      offset: const Offset(0, 4),
                                    ),
                                  ],
                                ),
                                child: TextField(
                                  controller: _phoneController,
                                  keyboardType: TextInputType.phone,
                                  maxLength: 10,
                                  decoration: const InputDecoration(
                                    labelText: 'Mobile Number',
                                    hintText: '10 digit phone',
                                    counterText: '',
                                    border: InputBorder.none,
                                    contentPadding: EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 16,
                                    ),
                                    prefixIcon: Icon(LucideIcons.smartphone),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 24),
                              Container(
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withOpacity(0.1),
                                      spreadRadius: 4,
                                      blurRadius: 16,
                                      offset: const Offset(0, 4),
                                    ),
                                  ],
                                ),
                                child: TextField(
                                  controller: _passwordController,
                                  obscureText: true,
                                  decoration: const InputDecoration(
                                    labelText: 'Password',
                                    border: InputBorder.none,
                                    contentPadding: EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 16,
                                    ),
                                    prefixIcon: Icon(LucideIcons.lock),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 16),
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.red,
                                fontSize: 12,
                              ),
                            ),
                          ],
                          const SizedBox(height: 32),
                          SizedBox(
                            width: double.infinity,
                            height: 56,
                            child: ElevatedButton.icon(
                              onPressed: _loading ? null : _submit,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFF13546),
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                elevation: 4,
                                padding: EdgeInsets.zero,
                              ),
                              icon: const Icon(LucideIcons.log_in),
                              label: Text(
                                _loading ? 'SIGNING IN...' : 'LOGIN',
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 1,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          Center(
                            child: GestureDetector(
                              onTap: () async {
                                final uri = Uri.parse(
                                  'https://smartvahan.net/dealer-registration',
                                );
                                await launchUrl(
                                  uri,
                                  mode: LaunchMode.externalApplication,
                                );
                              },
                              child: const Text(
                                'Want to be a dealer? Submit Request',
                                style: TextStyle(
                                  color: Color(0xFF00417B),
                                  fontWeight: FontWeight.w600,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    _refreshProfile();
  }

  Future<void> _refreshProfile() async {
    try {
      final prevDealerVersion = ApiSession.user?['dealerUpdatedAt']?.toString();
      final res = await api.get('/auth/me');
      if (res.data != null && res.data is Map) {
        ApiSession.user = res.data as Map<String, dynamic>;
        await ApiSession.saveToStorage();
        final nextDealerVersion = ApiSession.user?['dealerUpdatedAt']
            ?.toString();
        if (prevDealerVersion != null &&
            prevDealerVersion.isNotEmpty &&
            nextDealerVersion != null &&
            nextDealerVersion.isNotEmpty &&
            prevDealerVersion != nextDealerVersion) {
          await LookupService.invalidatePassingRtosCache();
        }
        if (mounted) setState(() {});
      }
    } catch (e) {
      print('Failed to refresh profile: $e');
    }
  }

  String _dealerTitle() {
    final u = ApiSession.user;
    if (u == null) return 'Dealer';
    if (u['name'] != null && u['name'].toString().isNotEmpty) {
      return u['name'].toString();
    }
    return 'Dealer';
  }

  String _dealerSubtitle() {
    final u = ApiSession.user;
    if (u == null) return '';
    if (u['role'] != null) {
      return u['role'].toString();
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: const Color(0xFF12314D),
        foregroundColor: Colors.white,
        title: const Text('SMARTVAHAN'),
        centerTitle: true,
        actions: [
          IconButton(icon: const Icon(LucideIcons.house), onPressed: () {}),
        ],
      ),
      drawer: Drawer(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 50, 16, 16),
              color: const Color(0xFF12314D),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Image.asset(
                    'assets/logo.png',
                    height: 150,
                    width: 150,
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) {
                      return const Icon(
                        LucideIcons.car,
                        color: Colors.white,
                        size: 120,
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _dealerTitle(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'User ID: ${ApiSession.user?['phone'] ?? '-'}',
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  Text(
                    'Authorised State: ${ApiSession.user?['stateName'] ?? ApiSession.user?['stateCode']?.toString() ?? '-'}',
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  Text(
                    'Authorised OEMs: ${ApiSession.user?['oems']?.toString() ?? '-'}',
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(LucideIcons.history),
              title: const Text('My Certificates'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(
                  context,
                ).pushNamedAndRemoveUntil('/history', (route) => false);
              },
            ),
            ListTile(
              leading: const Icon(LucideIcons.user),
              title: const Text('Profile'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(
                  context,
                ).pushNamedAndRemoveUntil('/profile', (route) => false);
              },
            ),
            ListTile(
              leading: const Icon(LucideIcons.headset),
              title: const Text('Support'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(
                  context,
                ).pushNamedAndRemoveUntil('/support', (route) => false);
              },
            ),
            ListTile(
              leading: const Icon(LucideIcons.log_out),
              title: const Text('Logout'),
              onTap: () async {
                await ApiSession.clearStorage();
                Navigator.of(
                  context,
                ).pushNamedAndRemoveUntil('/login', (route) => false);
              },
            ),
          ],
        ),
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/background.png',
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) {
              return Container(color: Colors.white);
            },
          ),
          SafeArea(child: _HomeContent()),
        ],
      ),
      bottomNavigationBar: const DealerBottomNav(currentIndex: 0),
    );
  }
}

class _HomeContent extends StatefulWidget {
  @override
  State<_HomeContent> createState() => _HomeContentState();
}

class _HomeContentState extends State<_HomeContent> {
  Map<String, dynamic> _stats = {'CT': 0, 'C3': 0, 'C4': 0, 'CTAUTO': 0};
  bool _loading = true;
  String? _locationLabel;

  String _dealerName() {
    final n = ApiSession.user?['name']?.toString().trim();
    return (n == null || n.isEmpty) ? 'Dealer' : n;
  }

  String _timeGreeting() {
    final h = DateTime.now().hour;
    if (h >= 5 && h < 12) return 'Good Morning';
    if (h >= 12 && h < 17) return 'Good Afternoon';
    if (h >= 17 && h < 22) return 'Good Evening';
    return 'Welcome';
  }

  @override
  void initState() {
    super.initState();
    _fetchStats();
    _fetchLocationLabel();
  }

  Future<void> _fetchLocationLabel() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (!mounted) return;
        setState(() {
          _locationLabel = 'Location unavailable';
        });
        return;
      }

      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.deniedForever ||
          perm == LocationPermission.denied) {
        if (!mounted) return;
        setState(() {
          _locationLabel = 'Location permission not granted';
        });
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.low,
        timeLimit: const Duration(seconds: 6),
      );

      String label =
          '${pos.latitude.toStringAsFixed(4)}, ${pos.longitude.toStringAsFixed(4)}';
      try {
        final places = await placemarkFromCoordinates(
          pos.latitude,
          pos.longitude,
        );
        if (places.isNotEmpty) {
          final p = places.first;
          final city = (p.locality != null && p.locality!.trim().isNotEmpty)
              ? p.locality!.trim()
              : null;
          final state =
              (p.administrativeArea != null &&
                  p.administrativeArea!.trim().isNotEmpty)
              ? p.administrativeArea!.trim()
              : null;
          final parts = <String>[];
          if (city != null) parts.add(city);
          if (state != null) parts.add(state);
          if (parts.isNotEmpty) label = parts.join(', ');
        }
      } catch (_) {}

      if (!mounted) return;
      setState(() {
        _locationLabel = label;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _locationLabel = 'Location unavailable';
      });
    }
  }

  Future<void> _fetchStats() async {
    try {
      final dealerId = ApiSession.user?['id'];
      if (dealerId == null) return;

      final now = DateTime.now();
      final start = DateTime(now.year, now.month, now.day).toIso8601String();
      final end = DateTime(
        now.year,
        now.month,
        now.day,
        23,
        59,
        59,
      ).toIso8601String();

      final res = await api.get(
        '/stats/dealer/daily',
        queryParameters: {
          'dealerId': dealerId,
          'startDate': start,
          'endDate': end,
        },
      );
      if (res.data is Map) {
        setState(() {
          _stats = Map<String, dynamic>.from(res.data as Map);
          _loading = false;
        });
      }
    } catch (e) {
      print('Failed to fetch stats: $e');
      setState(() {
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.only(
          left: 16,
          right: 16,
          top: 24,
          bottom: 24,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF12314D), Color(0xFF1E2D6B)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.20),
                    blurRadius: 18,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${_timeGreeting()} ${_dealerName()}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Welcome to SMARTVAHAN — India’s Smart Reflective Tape Compliance Platform. Scan, generate & verify certificates with ease.',
                              style: TextStyle(
                                color: Color(0xFFE6EEF7),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                height: 1.35,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.14),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          LucideIcons.badge_check,
                          color: Color(0xFFFFD56A),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(
                        LucideIcons.map_pin,
                        size: 16,
                        color: Color(0xFFE6EEF7),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _locationLabel ?? 'Detecting location…',
                          style: const TextStyle(
                            color: Color(0xFFE6EEF7),
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              height: 180,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF162F45), Color(0xFF00417B)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () {
                    Navigator.of(context).pushNamed('/scan');
                  },
                  borderRadius: BorderRadius.circular(16),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: const [
                      Icon(
                        LucideIcons.scan_qr_code,
                        color: Colors.white,
                        size: 72,
                      ),
                      SizedBox(height: 16),
                      Text(
                        'Scan QR Code',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 26,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              "Today's Overview",
              style: TextStyle(
                color: Color(0xFF12314D),
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 12),
            GridView(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                mainAxisExtent: 110,
              ),
              children: [
                _buildStatCard('CT', _stats['CT']?.toString() ?? '0'),
                _buildStatCard('C3', _stats['C3']?.toString() ?? '0'),
                _buildStatCard('C4', _stats['C4']?.toString() ?? '0'),
                _buildStatCard('CTAUTO', _stats['CTAUTO']?.toString() ?? '0'),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard(String label, String value) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            spreadRadius: 4,
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value,
            style: const TextStyle(
              color: Color(0xFF12314D),
              fontSize: 36,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF12314D),
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(
    String label, {
    bool isActive = true,
    Color? color,
    IconData? icon,
    bool badge = false,
    VoidCallback? onTap,
  }) {
    return Stack(
      children: [
        Container(
          width: double.infinity,
          height: double.infinity,
          decoration: BoxDecoration(
            gradient: isActive
                ? const LinearGradient(
                    colors: [Color(0xFF162F45), Color(0xFF00417B)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  )
                : null,
            color: isActive ? null : color,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(12),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, color: Colors.white, size: 40),
                    const SizedBox(height: 8),
                  ],
                  Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (badge)
          Positioned(
            top: 8,
            right: 8,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: const BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                LucideIcons.lock,
                color: Colors.white,
                size: 12,
              ),
            ),
          ),
      ],
    );
  }
}

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen>
    with SingleTickerProviderStateMixin {
  bool _handling = false;
  bool _torchOn = false;
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    facing: CameraFacing.back,
    formats: const [BarcodeFormat.qrCode],
  );
  late final AnimationController _scanAnimController;

  @override
  void initState() {
    super.initState();
    _scanAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _scannerController.dispose();
    _scanAnimController.dispose();
    super.dispose();
  }

  Future<void> _showErrorDialog(String message) async {
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        contentPadding: const EdgeInsets.all(24),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(LucideIcons.x, color: Colors.red, size: 40),
            ),
            const SizedBox(height: 16),
            const Text(
              'Scanning Failed',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFF12314D),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, color: Colors.black87),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF12314D),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                onPressed: () {
                  Navigator.of(ctx).pop();
                },
                child: const Text('Close', style: TextStyle(fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleQr(String value) async {
    if (_handling) return;
    setState(() {
      _handling = true;
    });

    try {
      await _scannerController.stop();

      final res = await api.post(
        '/certificates/validate-qr',
        data: {'qrContent': value},
      );
      final data = res.data as Map;
      final success = data['success'] == true;

      if (!success) {
        if (mounted) {
          await _showErrorDialog('Invalid QR Code');
          if (mounted) {
            await _scannerController.start();
            setState(() {
              _handling = false;
            });
          }
        }
        return;
      }

      final qrData = data['data'] as Map?;
      if (!mounted) return;

      await Navigator.of(context).pushReplacementNamed(
        '/form',
        arguments: qrData != null ? Map<String, dynamic>.from(qrData) : null,
      );

      if (mounted) {
        await _scannerController.start();
        setState(() {
          _handling = false;
        });
      }
    } on DioException catch (e) {
      String message = 'Validation failed';
      final resp = e.response;
      if (resp != null && resp.data is Map && resp.data['message'] != null) {
        message = resp.data['message'].toString();
      }
      if (mounted) {
        await _showErrorDialog(message);
        if (mounted) {
          await _scannerController.start();
          setState(() {
            _handling = false;
          });
        }
      }
    } catch (_) {
      if (mounted) {
        await _showErrorDialog('Network error');
        if (mounted) {
          await _scannerController.start();
          setState(() {
            _handling = false;
          });
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const scanBoxSize = 260.0;
    return WillPopScope(
      onWillPop: () async {
        Navigator.of(
          context,
        ).pushNamedAndRemoveUntil('/home', (Route<dynamic> route) => false);
        return false;
      },
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFF12314D),
          foregroundColor: Colors.white,
          title: const Text('Scan QR'),
          leading: IconButton(
            icon: const Icon(LucideIcons.arrow_left),
            onPressed: () {
              Navigator.of(context).pushNamedAndRemoveUntil(
                '/home',
                (Route<dynamic> route) => false,
              );
            },
          ),
        ),
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF12314D), Color(0xFF1F4060)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: SafeArea(
            child: Column(
              children: [
                const SizedBox(height: 16),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Align QR inside the frame',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: Container(
                    margin: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      color: Colors.black,
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(24),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          MobileScanner(
                            controller: _scannerController,
                            onDetect: (capture) {
                              final barcodes = capture.barcodes;
                              if (barcodes.isEmpty) return;
                              final value = barcodes.first.rawValue;
                              if (value == null || value.isEmpty) return;
                              _handleQr(value);
                            },
                          ),
                          Center(
                            child: SizedBox(
                              width: scanBoxSize,
                              height: scanBoxSize,
                              child: AnimatedBuilder(
                                animation: _scanAnimController,
                                builder: (context, _) {
                                  final t = _scanAnimController.value;
                                  final lineTop = t * (scanBoxSize - 4);
                                  return Stack(
                                    fit: StackFit.expand,
                                    children: [
                                      Container(
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(
                                            20,
                                          ),
                                          border: Border.all(
                                            color: Colors.white.withOpacity(
                                              0.85,
                                            ),
                                            width: 2,
                                          ),
                                        ),
                                      ),
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(20),
                                        child: Stack(
                                          children: [
                                            Positioned(
                                              left: 14,
                                              right: 14,
                                              top: lineTop,
                                              child: Container(
                                                height: 2.5,
                                                decoration: BoxDecoration(
                                                  borderRadius:
                                                      BorderRadius.circular(6),
                                                  gradient:
                                                      const LinearGradient(
                                                        colors: [
                                                          Color(0x0000D1FF),
                                                          Color(0xFF00D1FF),
                                                          Color(0x0000D1FF),
                                                        ],
                                                      ),
                                                  boxShadow: [
                                                    BoxShadow(
                                                      color: const Color(
                                                        0xFF00D1FF,
                                                      ).withOpacity(0.45),
                                                      blurRadius: 14,
                                                      spreadRadius: 1,
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Positioned(
                                        left: 0,
                                        top: 0,
                                        child: Container(
                                          width: 38,
                                          height: 38,
                                          decoration: BoxDecoration(
                                            borderRadius:
                                                const BorderRadius.only(
                                                  topLeft: Radius.circular(20),
                                                  bottomRight: Radius.circular(
                                                    18,
                                                  ),
                                                ),
                                            border: Border(
                                              left: BorderSide(
                                                color: const Color(
                                                  0xFF00D1FF,
                                                ).withOpacity(0.9),
                                                width: 3,
                                              ),
                                              top: BorderSide(
                                                color: const Color(
                                                  0xFF00D1FF,
                                                ).withOpacity(0.9),
                                                width: 3,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  );
                                },
                              ),
                            ),
                          ),
                          Positioned(
                            left: 16,
                            right: 16,
                            bottom: 16,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(16),
                                  child: BackdropFilter(
                                    filter: ImageFilter.blur(
                                      sigmaX: 14,
                                      sigmaY: 14,
                                    ),
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: Colors.white.withOpacity(0.16),
                                        borderRadius: BorderRadius.circular(16),
                                        border: Border.all(
                                          color: Colors.white.withOpacity(0.18),
                                        ),
                                      ),
                                      child: Material(
                                        color: Colors.transparent,
                                        child: InkWell(
                                          onTap: () async {
                                            try {
                                              await _scannerController
                                                  .toggleTorch();
                                              if (mounted) {
                                                setState(() {
                                                  _torchOn = !_torchOn;
                                                });
                                              }
                                            } catch (_) {}
                                          },
                                          borderRadius: BorderRadius.circular(
                                            16,
                                          ),
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 14,
                                              vertical: 12,
                                            ),
                                            child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Icon(
                                                  _torchOn
                                                      ? LucideIcons
                                                            .flashlight_off
                                                      : LucideIcons.flashlight,
                                                  color: Colors.white,
                                                  size: 18,
                                                ),
                                                const SizedBox(width: 10),
                                                Text(
                                                  _torchOn
                                                      ? 'Torch ON'
                                                      : 'Torch',
                                                  style: const TextStyle(
                                                    color: Colors.white,
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 13,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(18),
                                  child: BackdropFilter(
                                    filter: ImageFilter.blur(
                                      sigmaX: 16,
                                      sigmaY: 16,
                                    ),
                                    child: Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 14,
                                        vertical: 12,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withOpacity(0.14),
                                        borderRadius: BorderRadius.circular(18),
                                        border: Border.all(
                                          color: Colors.white.withOpacity(0.16),
                                        ),
                                      ),
                                      child: Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: const [
                                          Icon(
                                            LucideIcons.sparkles,
                                            color: Color(0xFFE6EEF7),
                                            size: 18,
                                          ),
                                          SizedBox(width: 10),
                                          Expanded(
                                            child: Text(
                                              'Hold steady — scanner detects QR automatically. Tap torch if lighting is poor.',
                                              style: TextStyle(
                                                color: Color(0xFFE6EEF7),
                                                fontSize: 12.5,
                                                fontWeight: FontWeight.w600,
                                                height: 1.3,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class FormScreen extends StatefulWidget {
  const FormScreen({super.key});

  @override
  State<FormScreen> createState() => _FormScreenState();
}

class _FormScreenState extends State<FormScreen> {
  final _formKey = GlobalKey<FormState>();

  final _vehicleMakeController = TextEditingController();
  final _vehicleCategoryController = TextEditingController();
  final _fuelTypeController = TextEditingController();
  final _passingRtoController = TextEditingController();
  final _registrationRtoController = TextEditingController();
  final _seriesController = TextEditingController();
  final _manufacturingYearController = TextEditingController();
  final _chassisNoController = TextEditingController();
  final _engineNoController = TextEditingController();
  final _ownerNameController = TextEditingController();
  final _ownerContactController = TextEditingController();
  final _locationController = TextEditingController();
  final _vehicleNumberController = TextEditingController();

  bool _submitting = false;
  String? _error;
  String? _success;

  Map<String, dynamic>? _qrArgs;

  final ImagePicker _imagePicker = ImagePicker();

  final List<String> _vehicleMakes = [
    'Tata Motors',
    'Ashok Leyland',
    'Mahindra & Mahindra',
    'Eicher Motors',
    'BharatBenz',
    'Maruti Suzuki',
    'Hyundai',
    'Toyota',
    'Honda',
    'Kia',
    'Force Motors',
    'SML Isuzu',
  ];

  final List<String> _fuelTypes = [
    'Diesel',
    'Petrol',
    'CNG',
    'LPG',
    'Electric',
    'Hybrid',
  ];

  late final List<String> _years;

  List<dynamic> _rtos = [];
  List<dynamic> _passingRtos = [];
  List<dynamic> _vehicleCategories = [];
  bool _loadingLookups = false;
  bool _lookupsLoaded = false;
  String? _lookupError;
  bool _locationRequested = false;
  String? _locationError;
  bool _initializing = false;
  bool _isVerifying = false;
  bool _consentGiven = false;
  final _verifyScrollController = ScrollController();
  bool _locationGateShown = false;
  double? _locationLat;
  double? _locationLng;

  final Map<String, String?> _photos = {
    'photoFrontLeft': null,
    'photoBackRight': null,
    'photoNumberPlate': null,
    'photoRc': null,
  };

  @override
  void initState() {
    super.initState();
    _years = List<String>.generate(
      62,
      (index) => (DateTime.now().year - index).toString(),
    );
    _registrationRtoController.addListener(_updateVehicleNumber);
    _seriesController.addListener(_updateVehicleNumber);

    // Listeners for form validity
    _vehicleMakeController.addListener(_onFieldChanged);
    _vehicleCategoryController.addListener(_onFieldChanged);
    _fuelTypeController.addListener(_onFieldChanged);
    _passingRtoController.addListener(_onFieldChanged);
    _registrationRtoController.addListener(_onFieldChanged);
    _seriesController.addListener(_onFieldChanged);
    _manufacturingYearController.addListener(_onFieldChanged);
    _chassisNoController.addListener(_onFieldChanged);
    _engineNoController.addListener(_onFieldChanged);
    _ownerNameController.addListener(_onFieldChanged);
    _ownerContactController.addListener(_onFieldChanged);
    _locationController.addListener(_onFieldChanged);

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      if (_qrArgs == null) {
        setState(() {
          _initializing = true;
        });
        try {
          var args =
              ModalRoute.of(context)?.settings.arguments
                  as Map<String, dynamic>?;

          // Fallback: Try to recover session if arguments are lost (e.g. Android Activity recreation)
          if (args == null || args.isEmpty) {
            final session = await LookupService.getActiveSession();
            if (session != null) {
              args = session;
            }
          }

          _qrArgs = args != null ? Map<String, dynamic>.from(args) : {};
          await _saveActiveSession();

          if (!mounted) return;
          await _checkLostData();
          _loadLookups();
          await _ensureLocationForCertificate(promptUser: true);
        } finally {
          if (mounted) {
            setState(() {
              _initializing = false;
            });
          }
        }
      }
    });
  }

  Future<void> _showLocationGateDialog({
    required String title,
    required String message,
    required bool canOpenLocationSettings,
  }) async {
    if (_locationGateShown) return;
    _locationGateShown = true;
    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () async {
                if (canOpenLocationSettings) {
                  await Geolocator.openLocationSettings();
                } else {
                  await Geolocator.openAppSettings();
                }
              },
              child: const Text('Open Settings'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop();
              },
              child: const Text('Retry'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                Navigator.of(
                  context,
                ).pushNamedAndRemoveUntil('/home', (route) => false);
              },
              child: const Text('Back'),
            ),
          ],
        ),
      );
    } finally {
      _locationGateShown = false;
    }
  }

  Future<bool> _ensureLocationForCertificate({required bool promptUser}) async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        _locationError = 'Location services are disabled';
        if (mounted) setState(() {});
        if (promptUser && mounted) {
          await _showLocationGateDialog(
            title: 'Location Required',
            message:
                'Please enable Location to generate certificates. Location is mandatory for tracking where the certificate is generated.',
            canOpenLocationSettings: true,
          );
        }
        return false;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        _locationError = 'Location permission not granted';
        if (mounted) setState(() {});
        if (promptUser && mounted) {
          await _showLocationGateDialog(
            title: 'Location Permission Required',
            message:
                'Please allow Location permission to generate certificates. Location is mandatory for tracking where the certificate is generated.',
            canOpenLocationSettings: false,
          );
        }
        return false;
      }

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );

      String display =
          '${position.latitude.toStringAsFixed(5)}, ${position.longitude.toStringAsFixed(5)}';
      try {
        final placemarks = await placemarkFromCoordinates(
          position.latitude,
          position.longitude,
        );
        if (placemarks.isNotEmpty) {
          final p = placemarks.first;
          final city = (p.locality != null && p.locality!.trim().isNotEmpty)
              ? p.locality!.trim()
              : (p.subAdministrativeArea != null &&
                    p.subAdministrativeArea!.trim().isNotEmpty)
              ? p.subAdministrativeArea!.trim()
              : null;
          final state =
              (p.administrativeArea != null && p.administrativeArea!.isNotEmpty)
              ? p.administrativeArea!.trim()
              : null;
          final pin = (p.postalCode != null && p.postalCode!.trim().isNotEmpty)
              ? p.postalCode!.trim()
              : null;
          final parts = <String>[];
          if (city != null) parts.add(city);
          if (state != null) parts.add(state);
          if (pin != null) parts.add(pin);
          if (parts.isNotEmpty) {
            display = parts.join(', ');
          }
        }
      } catch (_) {}

      final raw =
          '${position.latitude.toStringAsFixed(5)}, ${position.longitude.toStringAsFixed(5)}';
      final fullText = '$display | $raw';
      _locationLat = position.latitude;
      _locationLng = position.longitude;
      if (_locationController.text != fullText) {
        _locationController.text = fullText;
      }
      _locationError = null;
      if (mounted) setState(() {});
      return true;
    } catch (_) {
      _locationError = 'Failed to detect location';
      if (mounted) setState(() {});
      if (promptUser && mounted) {
        await _showLocationGateDialog(
          title: 'Location Required',
          message:
              'Unable to detect location. Please enable Location and try again.',
          canOpenLocationSettings: true,
        );
      }
      return false;
    }
  }

  Future<void> _saveActiveSession() async {
    if (_qrArgs != null) {
      await LookupService.saveActiveSession(_qrArgs!);
    }
  }

  void _onFieldChanged() {
    setState(() {});
  }

  bool get _isFormFilled {
    if (_vehicleMakeController.text.isEmpty) return false;
    if (_vehicleCategoryController.text.isEmpty) return false;
    if (_fuelTypeController.text.isEmpty) return false;
    if (_passingRtoController.text.isEmpty) return false;
    if (_registrationRtoController.text.isEmpty) return false;
    if (_seriesController.text.isEmpty) return false;
    if (_manufacturingYearController.text.isEmpty) return false;

    if (_chassisNoController.text.isEmpty ||
        _chassisNoController.text.length != 5) {
      return false;
    }
    if (_engineNoController.text.isEmpty ||
        _engineNoController.text.length != 5) {
      return false;
    }
    if (_ownerNameController.text.isEmpty) return false;
    if (_ownerContactController.text.isEmpty ||
        _ownerContactController.text.length != 10) {
      return false;
    }
    if (_locationController.text.isEmpty) return false;

    // Check photos
    if (_photos['photoFrontLeft'] == null) return false;
    if (_photos['photoBackRight'] == null) return false;
    if (_photos['photoNumberPlate'] == null) return false;
    if (_photos['photoRc'] == null) return false;

    return true;
  }

  Future<void> _checkLostData() async {
    try {
      final response = await _imagePicker.retrieveLostData();
      if (response.isEmpty) return;
      final file = response.file;
      if (file != null) {
        final prefs = await SharedPreferences.getInstance();
        final key = prefs.getString('pending_photo_key');
        if (key != null && _photos.containsKey(key)) {
          final originalBytes = await file.readAsBytes();
          img.Image? decoded = img.decodeImage(originalBytes);
          if (decoded != null) {
            if (decoded.width > 480) {
              decoded = img.copyResize(decoded, width: 480);
            }
            int quality = 80;
            List<int> compressedBytes = img.encodeJpg(
              decoded,
              quality: quality,
            );
            while (compressedBytes.length > 50000 && quality > 30) {
              quality -= 10;
              compressedBytes = img.encodeJpg(decoded, quality: quality);
            }
            final base64Str = base64Encode(compressedBytes);
            const mime = 'image/jpeg';
            final dataUrl = 'data:$mime;base64,$base64Str';
            if (mounted) {
              setState(() {
                _photos[key] = dataUrl;
              });
            }
          }
          await prefs.remove('pending_photo_key');
        }
      }
    } catch (_) {}
  }

  Future<void> _loadLookups() async {
    if (_lookupsLoaded) return;

    final stateCode = _qrArgs?['stateCode']?.toString();
    await LookupService.hydrateLookups(
      stateCode,
      dealerVersion: ApiSession.user?['dealerUpdatedAt']?.toString(),
    );

    // Check if we have everything we need in cache
    final needCats = LookupService.vehicleCategories == null;
    final needRtos =
        (stateCode != null && stateCode.isNotEmpty) &&
        LookupService.getRtos(stateCode) == null;
    final needPassingRtos =
        (stateCode != null && stateCode.isNotEmpty) &&
        LookupService.getPassingRtos(stateCode) == null;

    if (!needCats && !needRtos && !needPassingRtos) {
      if (!mounted) return;
      final cachedRtos = (LookupService.getRtos(stateCode) ?? []).toList();
      final cachedPassing = (LookupService.getPassingRtos(stateCode) ?? [])
          .toList();

      cachedRtos.sort((a, b) {
        final rawA = a is Map ? (a['name'] ?? a['code'] ?? '') : a;
        final rawB = b is Map ? (b['name'] ?? b['code'] ?? '') : b;
        return rawA.toString().toLowerCase().compareTo(
          rawB.toString().toLowerCase(),
        );
      });
      cachedPassing.sort((a, b) {
        final rawA = a is Map ? (a['name'] ?? a['code'] ?? '') : a;
        final rawB = b is Map ? (b['name'] ?? b['code'] ?? '') : b;
        return rawA.toString().toLowerCase().compareTo(
          rawB.toString().toLowerCase(),
        );
      });
      setState(() {
        _vehicleCategories = LookupService.vehicleCategories!;
        _rtos = cachedRtos;
        _passingRtos = cachedPassing;
        _lookupsLoaded = true;
        _loadingLookups = false;
      });
      return;
    }

    setState(() {
      _loadingLookups = true;
      _lookupError = null;
    });

    try {
      if (needRtos) {
        final rtoRes = await api.get(
          '/rtos',
          queryParameters: {'stateCode': stateCode},
        );
        if (rtoRes.data is List) {
          await LookupService.cacheRtos(
            stateCode,
            List<dynamic>.from(rtoRes.data as List),
          );
        }
      }

      if (needPassingRtos) {
        final rtoRes = await api.get(
          '/rtos/authorized',
          queryParameters: {'stateCode': stateCode},
        );
        if (rtoRes.data is List) {
          await LookupService.cachePassingRtos(
            stateCode,
            List<dynamic>.from(rtoRes.data as List),
            dealerVersion: ApiSession.user?['dealerUpdatedAt']?.toString(),
          );
        }
      }

      if (needCats) {
        final catRes = await api.get('/vehicle-categories');
        if (catRes.data is List) {
          LookupService.vehicleCategories = List<dynamic>.from(
            catRes.data as List,
          );
        }
      }

      if (!mounted) return;
      final rtos = LookupService.getRtos(stateCode) ?? [];
      final passingRtos = LookupService.getPassingRtos(stateCode) ?? [];
      rtos.sort((a, b) {
        final rawA = a is Map ? (a['name'] ?? a['code'] ?? '') : a;
        final rawB = b is Map ? (b['name'] ?? b['code'] ?? '') : b;
        return rawA.toString().toLowerCase().compareTo(
          rawB.toString().toLowerCase(),
        );
      });
      passingRtos.sort((a, b) {
        final rawA = a is Map ? (a['name'] ?? a['code'] ?? '') : a;
        final rawB = b is Map ? (b['name'] ?? b['code'] ?? '') : b;
        return rawA.toString().toLowerCase().compareTo(
          rawB.toString().toLowerCase(),
        );
      });
      setState(() {
        _vehicleCategories = LookupService.vehicleCategories ?? [];
        _rtos = rtos;
        _passingRtos = passingRtos;
        _loadingLookups = false;
        _lookupsLoaded = true;
      });
    } on DioException catch (e) {
      String message = 'Failed to load options';
      final resp = e.response;
      if (resp != null && resp.data is Map && resp.data['message'] != null) {
        message = resp.data['message'].toString();
      }
      if (mounted) {
        setState(() {
          _loadingLookups = false;
          _lookupError = message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loadingLookups = false;
          _lookupError = 'Network error while loading options';
        });
      }
    }
  }

  void _updateVehicleNumber() {
    final rto = _registrationRtoController.text.trim();
    final series = _seriesController.text.trim();
    _vehicleNumberController.text = '$rto$series';
  }

  @override
  void dispose() {
    _vehicleMakeController.dispose();
    _vehicleCategoryController.dispose();
    _fuelTypeController.dispose();
    _passingRtoController.dispose();
    _registrationRtoController.dispose();
    _seriesController.dispose();
    _vehicleNumberController.dispose();
    _manufacturingYearController.dispose();
    _chassisNoController.dispose();
    _engineNoController.dispose();
    _ownerNameController.dispose();
    _ownerContactController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _capturePhoto(String key) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('pending_photo_key', key);

    final XFile? file = await _imagePicker.pickImage(
      source: ImageSource.camera,
      maxWidth: 480,
      imageQuality: 80,
    );

    if (file == null) {
      await prefs.remove('pending_photo_key');
      return;
    }

    await prefs.remove('pending_photo_key');

    final originalBytes = await file.readAsBytes();
    img.Image? decoded = img.decodeImage(originalBytes);
    if (decoded == null) return;
    if (decoded.width > 480) {
      decoded = img.copyResize(decoded, width: 480);
    }
    int quality = 80;
    List<int> compressedBytes = img.encodeJpg(decoded, quality: quality);
    while (compressedBytes.length > 50000 && quality > 30) {
      quality -= 10;
      compressedBytes = img.encodeJpg(decoded, quality: quality);
    }
    final base64Str = base64Encode(compressedBytes);
    const mime = 'image/jpeg';
    final dataUrl = 'data:$mime;base64,$base64Str';
    if (!mounted) return;
    setState(() {
      _photos[key] = dataUrl;
    });
  }

  Future<void> _showErrorDialog(String message) async {
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        contentPadding: const EdgeInsets.all(24),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(LucideIcons.x, color: Colors.red, size: 40),
            ),
            const SizedBox(height: 16),
            const Text(
              'Submission Failed',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFF12314D),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, color: Colors.black87),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF12314D),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                ),
                onPressed: () {
                  Navigator.of(ctx).pop();
                },
                child: const Text('OK'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submitForm() async {
    _locationRequested = true;
    final ok = await _ensureLocationForCertificate(promptUser: true);
    if (!ok) return;

    if (!_isVerifying) {
      final currentState = _formKey.currentState;
      if (currentState == null) return;
      if (!currentState.validate()) return;
    }

    final qrValue = _qrArgs?['value']?.toString();
    if (qrValue == null || qrValue.isEmpty) {
      if (mounted) {
        _showErrorDialog('Missing QR value from scan. Please rescan.');
      }
      return;
    }

    final missingPhoto = _photos.values.any(
      (value) => value == null || value.isEmpty,
    );
    if (missingPhoto) {
      if (mounted) {
        _showErrorDialog(
          'Please capture all fitment photos before submitting.',
        );
      }
      return;
    }

    final vehicleDetails = {
      'vehicleMake': _vehicleMakeController.text.trim(),
      'vehicleCategory': _vehicleCategoryController.text.trim(),
      'fuelType': _fuelTypeController.text.trim(),
      'passingRto': _passingRtoController.text.trim(),
      'registrationRto': _registrationRtoController.text.trim(),
      'series': _seriesController.text.trim(),
      'manufacturingYear': _manufacturingYearController.text.trim(),
      'chassisNo': _chassisNoController.text.trim(),
      'engineNo': _engineNoController.text.trim(),
    };

    final ownerDetails = {
      'ownerName': _ownerNameController.text.trim(),
      'ownerContact': _ownerContactController.text.trim(),
    };

    final photos = {
      'photoFrontLeft': _photos['photoFrontLeft'],
      'photoBackRight': _photos['photoBackRight'],
      'photoNumberPlate': _photos['photoNumberPlate'],
      'photoRc': _photos['photoRc'],
    };

    final payload = {
      'qrValue': qrValue,
      'vehicleDetails': vehicleDetails,
      'ownerDetails': ownerDetails,
      'photos': photos,
      'locationText': _locationController.text.trim(),
      'locationLat': _locationLat,
      'locationLng': _locationLng,
    };

    setState(() {
      _submitting = true;
      _error = null;
      _success = null;
    });

    int retryCount = 0;
    const maxRetries = 1;

    while (true) {
      try {
        final res = await api.post('/certificates/create', data: payload);
        final data = res.data as Map;
        final success = data['success'] == true;
        if (success) {
          final msg = data['message']?.toString() ?? 'Certificate generated';
          final pdfUrlRaw = data['pdfUrl']?.toString();
          final baseUrl = 'https://smartvahan.net';
          final fullUrl = pdfUrlRaw != null && pdfUrlRaw.isNotEmpty
              ? (pdfUrlRaw.startsWith('http')
                    ? pdfUrlRaw
                    : '$baseUrl$pdfUrlRaw')
              : null;
          final qrSerialSuccess = _qrArgs?['serialNumber']?.toString();
          final brandSuccess = _qrArgs?['oemName']?.toString();
          final materialSuccess = _qrArgs?['product']?.toString();
          final vehicleNumberFromQr = _qrArgs?['vehicleNumber']?.toString();
          final vehicleNumberSuccess =
              vehicleNumberFromQr != null && vehicleNumberFromQr.isNotEmpty
              ? vehicleNumberFromQr
              : '${_registrationRtoController.text.trim()} ${_seriesController.text.trim()} ${_chassisNoController.text.trim()}';
          if (!mounted) return;
          setState(() {
            _submitting = false;
          });

          final qrValue = _qrArgs?['value']?.toString();
          if (qrValue != null) {
            await LookupService.clearDraft(qrValue);
          }
          await LookupService.clearActiveSession();

          if (!mounted) return;
          Navigator.of(context).pushReplacementNamed(
            '/success',
            arguments: {
              'message': msg,
              'pdfUrl': fullUrl,
              'qrSerial': qrSerialSuccess,
              'brand': brandSuccess,
              'material': materialSuccess,
              'vehicleNumber': vehicleNumberSuccess,
            },
          );
          return; // Exit function on success
        } else {
          setState(() {
            _submitting = false;
          });
          if (mounted) {
            _showErrorDialog(
              data['message']?.toString() ?? 'Failed to generate certificate',
            );
          }
          return; // Exit on API failure response
        }
      } on DioException catch (e) {
        if (retryCount < maxRetries) {
          retryCount++;
          await Future.delayed(const Duration(seconds: 1));
          continue; // Retry
        }

        String message = 'Submission failed';
        final resp = e.response;
        if (resp != null && resp.data is Map && resp.data['message'] != null) {
          message = resp.data['message'].toString();
        }
        if (message.contains('Unique constraint failed') &&
            message.contains('qrCodeId')) {
          message = 'Certificate is already generated for this QR code.';
        }
        setState(() {
          _submitting = false;
        });
        if (mounted) {
          _showErrorDialog(message);
        }
        return; // Exit on exception after retries
      } catch (_) {
        if (retryCount < maxRetries) {
          retryCount++;
          await Future.delayed(const Duration(seconds: 1));
          continue;
        }
        setState(() {
          _submitting = false;
        });
        if (mounted) {
          _showErrorDialog('Network error');
        }
        return;
      }
    }
  }

  TextInputFormatter get _upperCaseFormatter =>
      TextInputFormatter.withFunction((oldValue, newValue) {
        return newValue.copyWith(text: newValue.text.toUpperCase());
      });

  Widget _buildGlassContainer({required Widget child}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      decoration: BoxDecoration(
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.85),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Colors.white.withOpacity(0.6),
                width: 1.5,
              ),
            ),
            child: child,
          ),
        ),
      ),
    );
  }

  Widget _buildGradientFormCard({
    required String title,
    required String subtitle,
    required List<Widget> children,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            spreadRadius: 2,
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF162F45), Color(0xFF00417B)],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              ),
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
            ),
            child: Column(
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: children),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, String subtitle) {
    return Column(
      children: [
        const SizedBox(height: 24),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Color(0xFF12314D),
          ),
        ),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: Color(0xFF12314D),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildFormInput({
    required TextEditingController controller,
    required String label,
    String? Function(String?)? validator,
    TextInputType keyboardType = TextInputType.text,
    bool readOnly = false,
    bool enabled = true,
    String? note,
    int? maxLength,
    List<TextInputFormatter>? inputFormatters,
    ValueChanged<String>? onChanged,
    Color? fillColor,
    Color? textColor,
    Color? labelColor,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: fillColor ?? Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                spreadRadius: 2,
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: TextFormField(
            controller: controller,
            validator: validator,
            keyboardType: keyboardType,
            readOnly: readOnly,
            enabled: enabled,
            maxLength: maxLength,
            inputFormatters: inputFormatters,
            onChanged: onChanged,
            style: TextStyle(
              fontSize: 14,
              color: textColor ?? const Color(0xFF12314D),
            ),
            decoration: InputDecoration(
              labelText: label,
              labelStyle: TextStyle(
                color: labelColor ?? Colors.grey[600],
                fontSize: 14,
              ),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 14,
              ),
              counterText: "",
            ),
          ),
        ),
        if (note != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              note,
              style: const TextStyle(
                color: Colors.red,
                fontSize: 11,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildFormDropdown<T>({
    required T? value,
    required List<DropdownMenuItem<T>> items,
    required String label,
    required ValueChanged<T?> onChanged,
    String? Function(T?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                spreadRadius: 2,
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: DropdownButtonFormField<T>(
            value: value,
            items: items,
            onChanged: onChanged,
            validator: validator,
            isExpanded: true,
            menuMaxHeight: 360,
            style: const TextStyle(fontSize: 14, color: Color(0xFF12314D)),
            decoration: InputDecoration(
              labelText: label,
              labelStyle: TextStyle(color: Colors.grey[600], fontSize: 14),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 14,
              ),
            ),
            icon: const Icon(
              LucideIcons.chevron_down,
              color: Color(0xFF12314D),
            ),
            dropdownColor: Colors.white,
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildDisabledInput(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: const Color(0xFFF7F7F7),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                spreadRadius: 1,
                blurRadius: 4,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(color: Colors.grey[600], fontSize: 12),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: const TextStyle(
                  color: Color(0xFF12314D),
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildQrDetailCard(String label, String value) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF162F45), Color(0xFF00417B)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.bold,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildPhotoRow(String title, String key) {
    final hasPhoto = _photos[key] != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Container(
            width: 120,
            height: 160,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: hasPhoto
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(
                      base64Decode(_photos[key]!.split(',').last),
                      fit: BoxFit.cover,
                      gaplessPlayback: true,
                    ),
                  )
                : const Icon(LucideIcons.image, color: Colors.grey, size: 40),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: SizedBox(
              height: 40,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.1),
                      spreadRadius: 1,
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: ElevatedButton.icon(
                  onPressed: () => _capturePhoto(key),
                  icon: Icon(
                    hasPhoto ? LucideIcons.circle_check : LucideIcons.camera,
                    color: hasPhoto ? Colors.green : const Color(0xFF12314D),
                    size: 18,
                  ),
                  label: Text(
                    title,
                    style: const TextStyle(
                      color: Color(0xFF12314D),
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFF12314D),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                    alignment: Alignment.centerLeft,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVerificationPhoto(String title, String key) {
    final hasPhoto = _photos[key] != null;
    return Column(
      children: [
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: Colors.grey[200],
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: hasPhoto
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(
                      base64Decode(_photos[key]!.split(',').last),
                      fit: BoxFit.cover,
                      width: double.infinity,
                      gaplessPlayback: true,
                    ),
                  )
                : const Icon(LucideIcons.image_off, color: Colors.grey),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
        ),
      ],
    );
  }

  Widget _buildVerificationView(
    String? qrSerial,
    String? stateCode,
    String? oemName,
    String? product,
  ) {
    return SingleChildScrollView(
      controller: _verifyScrollController,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildSectionTitle('Verify Details', 'विवरण सत्यापित करें'),
          if (qrSerial != null) ...[
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              childAspectRatio: 2.5,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              children: [
                _buildQrDetailCard('State', stateCode ?? '-'),
                _buildQrDetailCard('OEM', oemName ?? '-'),
                _buildQrDetailCard('QR Serial', qrSerial),
                _buildQrDetailCard('Product', product ?? '-'),
              ],
            ),
            const SizedBox(height: 12),
            const Divider(thickness: 1, color: Colors.grey),
          ],

          _buildGlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildSectionTitle('Vehicle Details', 'वाहन की सूची'),
                _buildDisabledInput(
                  'Vehicle Make',
                  _vehicleMakeController.text,
                ),
                const SizedBox(height: 8),
                _buildDisabledInput(
                  'Vehicle Category',
                  _vehicleCategoryController.text,
                ),
                const SizedBox(height: 8),
                _buildDisabledInput('Fuel Type', _fuelTypeController.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Passing RTO', _passingRtoController.text),
                const SizedBox(height: 8),
                _buildDisabledInput(
                  'Registration RTO',
                  _registrationRtoController.text,
                ),
                const SizedBox(height: 8),
                _buildDisabledInput('Series', _seriesController.text),
                const SizedBox(height: 8),
                _buildDisabledInput(
                  'Vehicle Number',
                  _vehicleNumberController.text,
                ),
                const SizedBox(height: 8),
                _buildDisabledInput(
                  'Manufacturing Year',
                  _manufacturingYearController.text,
                ),
                const SizedBox(height: 8),
                _buildDisabledInput('Chassis No', _chassisNoController.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Engine No', _engineNoController.text),
                const SizedBox(height: 12),
                const Divider(thickness: 1, color: Colors.grey),

                _buildSectionTitle('Owner Details', 'वाहन मालिक का विवरण'),
                _buildDisabledInput('Owner Name', _ownerNameController.text),
                const SizedBox(height: 8),
                _buildDisabledInput(
                  'Owner Contact',
                  _ownerContactController.text,
                ),
                const SizedBox(height: 8),
                _buildDisabledInput('Location', _locationController.text),

                const SizedBox(height: 12),
                const Divider(thickness: 1, color: Colors.grey),

                _buildSectionTitle('Fitment Photos', 'फिटमेंट की तस्वीरें'),
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  childAspectRatio: 0.75,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  children: [
                    _buildVerificationPhoto('Front Left', 'photoFrontLeft'),
                    _buildVerificationPhoto('Back Right', 'photoBackRight'),
                    _buildVerificationPhoto('Number Plate', 'photoNumberPlate'),
                    _buildVerificationPhoto('RC Copy', 'photoRc'),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Consent Checkbox
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _consentGiven
                    ? const Color(0xFF12314D)
                    : Colors.grey.shade300,
              ),
            ),
            child: CheckboxListTile(
              value: _consentGiven,
              onChanged: (val) {
                setState(() {
                  _consentGiven = val ?? false;
                });
              },
              activeColor: const Color(0xFF12314D),
              title: const Text(
                'I confirm that all information entered is correct.\nमैंने विवरणों की जाँच कर ली है और पुष्टि करता हूँ कि वे सही हैं।',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
              ),
              controlAffinity: ListTileControlAffinity.leading,
            ),
          ),

          const SizedBox(height: 24),

          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {
                    setState(() {
                      _isVerifying = false;
                    });
                  },
                  icon: const Icon(LucideIcons.pencil, color: Colors.white),
                  label: const Text(
                    'Edit Details',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF12314D),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _consentGiven && !_submitting ? _submitForm : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFF13546),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 4,
                    disabledBackgroundColor: Colors.grey[400],
                  ),
                  icon: _submitting
                      ? const SizedBox.shrink()
                      : const Icon(
                          LucideIcons.shield_check,
                          color: Colors.white,
                        ),
                  label: _submitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Text(
                          'GENERATE',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 1,
                            color: Colors.white,
                          ),
                        ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final args = _qrArgs ?? {};
    final qrSerial = args['serialNumber']?.toString();
    final stateCode = args['stateCode']?.toString();
    final product = args['product']?.toString();
    final oemName = args['oemName']?.toString() ?? args['oem']?.toString();

    return WillPopScope(
      onWillPop: () async {
        if (_isVerifying) {
          setState(() {
            _isVerifying = false;
          });
          return false;
        }
        await LookupService.clearActiveSession();
        if (!mounted) return false;
        Navigator.of(
          context,
        ).pushNamedAndRemoveUntil('/home', (Route<dynamic> route) => false);
        return false;
      },
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFF12314D),
          foregroundColor: Colors.white,
          title: Text(_isVerifying ? 'Verify Details' : 'Fitment Form'),
          leading: IconButton(
            icon: const Icon(LucideIcons.arrow_left),
            onPressed: () async {
              if (_isVerifying) {
                setState(() {
                  _isVerifying = false;
                });
                return;
              }
              await LookupService.clearActiveSession();
              if (!mounted) return;
              Navigator.of(context).pushNamedAndRemoveUntil(
                '/home',
                (Route<dynamic> route) => false,
              );
            },
          ),
        ),
        body: Container(
          decoration: const BoxDecoration(
            image: DecorationImage(
              image: AssetImage('assets/background.png'),
              fit: BoxFit.cover,
            ),
          ),
          child: SafeArea(
            child: _initializing
                ? const Center(child: CircularProgressIndicator())
                : _isVerifying
                ? _buildVerificationView(qrSerial, stateCode, oemName, product)
                : SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (qrSerial != null) ...[
                            GridView.count(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              crossAxisCount: 2,
                              childAspectRatio: 2.5,
                              crossAxisSpacing: 12,
                              mainAxisSpacing: 12,
                              children: [
                                _buildQrDetailCard('State', stateCode ?? '-'),
                                _buildQrDetailCard('OEM', oemName ?? '-'),
                                _buildQrDetailCard('QR Serial', qrSerial),
                                _buildQrDetailCard('Product', product ?? '-'),
                              ],
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Kindly Fill Below Details As Per RC/Form 28 29/Form 20',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.red,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Divider(thickness: 1, color: Colors.grey),
                          ],

                          _buildGradientFormCard(
                            title: 'Vehicle Details',
                            subtitle: 'वाहन की सूची',
                            children: [
                              if (_loadingLookups)
                                const Padding(
                                  padding: EdgeInsets.only(bottom: 12),
                                  child: Row(
                                    children: [
                                      SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Color(0xFF12314D),
                                        ),
                                      ),
                                      SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          'Loading RTO options…',
                                          style: TextStyle(
                                            color: Color(0xFF12314D),
                                            fontWeight: FontWeight.w600,
                                            fontSize: 12.5,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              if (_lookupError != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: Text(
                                    _lookupError!,
                                    style: const TextStyle(
                                      color: Colors.red,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12.5,
                                    ),
                                  ),
                                ),
                              _buildFormDropdown<String>(
                                value: _vehicleMakeController.text.isNotEmpty
                                    ? _vehicleMakeController.text
                                    : null,
                                items: _vehicleMakes
                                    .map(
                                      (e) => DropdownMenuItem(
                                        value: e,
                                        child: Text(e),
                                      ),
                                    )
                                    .toList(),
                                label: 'Vehicle Make / वाहन निर्माता',
                                onChanged: (val) {
                                  if (val != null) {
                                    _vehicleMakeController.text = val;
                                  }
                                },
                                validator: (v) =>
                                    v == null || v.isEmpty ? 'Required' : null,
                              ),

                              _buildFormDropdown<String>(
                                value:
                                    _vehicleCategoryController.text.isNotEmpty
                                    ? _vehicleCategoryController.text
                                    : null,
                                items: _vehicleCategories
                                    .map<DropdownMenuItem<String>>((e) {
                                      final name = e['name']?.toString() ?? '';
                                      return DropdownMenuItem(
                                        value: name,
                                        child: Text(name),
                                      );
                                    })
                                    .toList(),
                                label: 'Vehicle Category / वाहन श्रेणी',
                                onChanged: (val) {
                                  if (val != null) {
                                    _vehicleCategoryController.text = val;
                                  }
                                },
                                validator: (v) =>
                                    v == null || v.isEmpty ? 'Required' : null,
                              ),

                              _buildFormDropdown<String>(
                                value: _fuelTypeController.text.isNotEmpty
                                    ? _fuelTypeController.text
                                    : null,
                                items: _fuelTypes
                                    .map(
                                      (e) => DropdownMenuItem(
                                        value: e,
                                        child: Text(e),
                                      ),
                                    )
                                    .toList(),
                                label: 'Fuel Type / ईंधन का प्रकार',
                                onChanged: (val) {
                                  if (val != null) {
                                    _fuelTypeController.text = val;
                                  }
                                },
                                validator: (v) =>
                                    v == null || v.isEmpty ? 'Required' : null,
                              ),

                              _buildFormDropdown<String>(
                                value: _passingRtoController.text.isNotEmpty
                                    ? _passingRtoController.text
                                    : null,
                                items: _passingRtos
                                    .map<DropdownMenuItem<String>>((e) {
                                      String code = '';
                                      String name = '';
                                      if (e is Map) {
                                        code =
                                            e['code']?.toString() ??
                                            e.toString();
                                        name = e['name']?.toString() ?? '';
                                      } else {
                                        code = e.toString();
                                      }
                                      final label = name.trim().isNotEmpty
                                          ? '$name ($code)'
                                          : code;
                                      return DropdownMenuItem(
                                        value: code,
                                        child: Text(label),
                                      );
                                    })
                                    .toList(),
                                label: 'Passing RTO / पासिंग आर.टी.ओ.',
                                onChanged: (val) {
                                  if (val != null) {
                                    _passingRtoController.text = val;
                                  }
                                },
                                validator: (v) =>
                                    v == null || v.isEmpty ? 'Required' : null,
                              ),

                              _buildFormDropdown<String>(
                                value:
                                    _registrationRtoController.text.isNotEmpty
                                    ? _registrationRtoController.text
                                    : null,
                                items: _rtos.map<DropdownMenuItem<String>>((e) {
                                  String code = '';
                                  String name = '';
                                  if (e is Map) {
                                    code =
                                        e['code']?.toString() ?? e.toString();
                                    name = e['name']?.toString() ?? '';
                                  } else {
                                    code = e.toString();
                                  }
                                  final label = name.trim().isNotEmpty
                                      ? '$name ($code)'
                                      : code;
                                  return DropdownMenuItem(
                                    value: code,
                                    child: Text(label),
                                  );
                                }).toList(),
                                label: 'Registration RTO / पंजीकरण आर.टी.ओ.',
                                onChanged: (val) {
                                  if (val != null) {
                                    _registrationRtoController.text = val;
                                    _updateVehicleNumber();
                                  }
                                },
                                validator: (v) =>
                                    v == null || v.isEmpty ? 'Required' : null,
                              ),

                              _buildFormInput(
                                controller: _seriesController,
                                label: 'Series / शृंखला',
                                note:
                                    'Only Enter Value After Registration RTO / केवल RTO के बाद की श्रृंखला दर्ज करें (जैसे QRxxxx)',
                                validator: (v) =>
                                    v == null || v.isEmpty ? 'Required' : null,
                                inputFormatters: [
                                  FilteringTextInputFormatter.allow(
                                    RegExp(r'[a-zA-Z0-9]'),
                                  ),
                                  _upperCaseFormatter,
                                ],
                                maxLength: 10,
                                onChanged: (val) => _updateVehicleNumber(),
                              ),

                              _buildFormInput(
                                controller: _vehicleNumberController,
                                label: 'Vehicle Number (Auto-generated)',
                                readOnly: true,
                                fillColor: const Color(0xFF91A8BD),
                                textColor: Colors.white,
                                labelColor: Colors.white,
                              ),

                              _buildFormDropdown<String>(
                                value:
                                    _manufacturingYearController.text.isNotEmpty
                                    ? _manufacturingYearController.text
                                    : null,
                                items: _years
                                    .map(
                                      (e) => DropdownMenuItem(
                                        value: e,
                                        child: Text(e),
                                      ),
                                    )
                                    .toList(),
                                label: 'Manufacturing Year / निर्माण वर्ष',
                                onChanged: (val) {
                                  if (val != null) {
                                    _manufacturingYearController.text = val;
                                  }
                                },
                                validator: (v) =>
                                    v == null || v.isEmpty ? 'Required' : null,
                              ),

                              _buildFormInput(
                                controller: _chassisNoController,
                                label: 'Chassis No / चेसिस नंबर',
                                validator: (v) {
                                  if (v == null || v.isEmpty) return 'Required';
                                  if (v.length != 5) {
                                    return 'Must be 5 characters';
                                  }
                                  return null;
                                },
                                inputFormatters: [
                                  FilteringTextInputFormatter.allow(
                                    RegExp(r'[a-zA-Z0-9]'),
                                  ),
                                  _upperCaseFormatter,
                                ],
                                maxLength: 5,
                              ),

                              _buildFormInput(
                                controller: _engineNoController,
                                label: 'Engine No / इंजन नंबर',
                                validator: (v) {
                                  if (v == null || v.isEmpty) return 'Required';
                                  if (v.length != 5) {
                                    return 'Must be 5 characters';
                                  }
                                  return null;
                                },
                                inputFormatters: [
                                  FilteringTextInputFormatter.allow(
                                    RegExp(r'[a-zA-Z0-9]'),
                                  ),
                                  _upperCaseFormatter,
                                ],
                                maxLength: 5,
                              ),
                            ],
                          ),

                          _buildGradientFormCard(
                            title: 'Owner Details',
                            subtitle: 'वाहन मालिक का विवरण',
                            children: [
                              _buildFormInput(
                                controller: _ownerNameController,
                                label: 'Owner Name / मालिक का नाम',
                                validator: (v) =>
                                    v == null || v.isEmpty ? 'Required' : null,
                                inputFormatters: [
                                  FilteringTextInputFormatter.allow(
                                    RegExp(r'[a-zA-Z\s]'),
                                  ),
                                  _upperCaseFormatter,
                                ],
                              ),

                              _buildFormInput(
                                controller: _ownerContactController,
                                label: 'Owner Contact / मालिक का संपर्क',
                                keyboardType: TextInputType.phone,
                                validator: (v) {
                                  if (v == null || v.isEmpty) {
                                    return 'Required';
                                  }
                                  if (v.length != 10) {
                                    return 'Must be 10 digits';
                                  }
                                  return null;
                                },
                                inputFormatters: [
                                  FilteringTextInputFormatter.digitsOnly,
                                ],
                                maxLength: 10,
                              ),

                              _buildFormInput(
                                controller: _locationController,
                                label: 'Location / स्थान',
                                readOnly: true,
                                validator: (v) => v == null || v.isEmpty
                                    ? 'Location required'
                                    : null,
                              ),
                              if (_locationError != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 16),
                                  child: Text(
                                    _locationError!,
                                    style: const TextStyle(color: Colors.red),
                                  ),
                                ),
                            ],
                          ),

                          const Divider(thickness: 1, color: Colors.grey),

                          _buildGradientFormCard(
                            title: 'Fitment Photos',
                            subtitle: 'फिटमेंट की तस्वीरें',
                            children: [
                              _buildPhotoRow('Front Left', 'photoFrontLeft'),
                              _buildPhotoRow('Back Right', 'photoBackRight'),
                              _buildPhotoRow(
                                'Number Plate',
                                'photoNumberPlate',
                              ),
                              _buildPhotoRow('RC Copy', 'photoRc'),
                            ],
                          ),

                          const SizedBox(height: 24),

                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _isFormFilled && !_submitting
                                  ? () {
                                      final currentState =
                                          _formKey.currentState;
                                      if (currentState == null ||
                                          !currentState.validate()) {
                                        return;
                                      }

                                      final qrValue = _qrArgs?['value']
                                          ?.toString();
                                      if (qrValue == null || qrValue.isEmpty) {
                                        setState(() {
                                          _error =
                                              'Missing QR value from scan. Please rescan.';
                                          _success = null;
                                        });
                                        return;
                                      }

                                      final missingPhoto = _photos.values.any(
                                        (value) =>
                                            value == null || value.isEmpty,
                                      );
                                      if (missingPhoto) {
                                        setState(() {
                                          _error =
                                              'Please capture all fitment photos before submitting.';
                                          _success = null;
                                        });
                                        return;
                                      }

                                      setState(() {
                                        _isVerifying = true;
                                        _consentGiven = false;
                                        _error = null;
                                      });

                                      WidgetsBinding.instance
                                          .addPostFrameCallback((_) {
                                            if (_verifyScrollController
                                                .hasClients) {
                                              _verifyScrollController.jumpTo(0);
                                            }
                                          });
                                    }
                                  : null,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFF13546),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 16,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                elevation: 4,
                                disabledBackgroundColor: Colors.grey[400],
                              ),
                              icon: const Icon(
                                LucideIcons.shield_check,
                                color: Colors.white,
                              ),
                              label: const Text(
                                'Verify Details',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 1,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 16),
                              child: Text(
                                _error!,
                                style: const TextStyle(color: Colors.red),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          const SizedBox(height: 32),
                        ],
                      ),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class CertificateSuccessScreen extends StatefulWidget {
  const CertificateSuccessScreen({super.key});

  @override
  State<CertificateSuccessScreen> createState() =>
      _CertificateSuccessScreenState();
}

class _CertificateSuccessScreenState extends State<CertificateSuccessScreen> {
  Uri? _pdfUri;
  String _message = 'Certificate generated successfully';
  String? _brand;
  String? _material;
  String? _qrSerial;
  String? _vehicleNumber;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args =
        ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
    if (args != null) {
      final msg = args['message']?.toString();
      final pdfUrl = args['pdfUrl']?.toString();
      if (msg != null && msg.isNotEmpty) {
        _message = msg;
      }
      if (pdfUrl != null && pdfUrl.isNotEmpty) {
        _pdfUri = Uri.tryParse(pdfUrl);
      }
      _brand = args['brand']?.toString();
      _material = args['material']?.toString();
      _qrSerial = args['qrSerial']?.toString();
      _vehicleNumber = args['vehicleNumber']?.toString();
    }
  }

  Future<void> _openPdfWithViewer() async {
    if (_pdfUri == null) {
      return;
    }
    final url = _pdfUri.toString();
    try {
      await openPdfFromUrl(url, filenameHint: 'smartvahan_certificate');
    } catch (_) {}
  }

  Future<void> _shareCertificate() async {
    if (_pdfUri == null) {
      return;
    }
    final buffer = StringBuffer();
    buffer.writeln('SMARTVAHAN Fitment Certificate');
    if (_brand != null && _brand!.isNotEmpty) {
      buffer.writeln('Brand: ${_brand!}');
    }
    if (_material != null && _material!.isNotEmpty) {
      buffer.writeln('Material: ${_material!}');
    }
    if (_qrSerial != null && _qrSerial!.isNotEmpty) {
      buffer.writeln('QR Serial: ${_qrSerial!}');
    }
    if (_vehicleNumber != null && _vehicleNumber!.isNotEmpty) {
      buffer.writeln('Vehicle: ${_vehicleNumber!}');
    }
    buffer.writeln('Certificate PDF: ${_pdfUri.toString()}');
    await Share.share(buffer.toString());
  }

  void _goHome() {
    Navigator.of(
      context,
    ).pushNamedAndRemoveUntil('/home', (Route<dynamic> route) => false);
  }

  void _scanNew() {
    _goHome();
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        _goHome();
        return false;
      },
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFF12314D),
          foregroundColor: Colors.white,
          title: const Text('Certificate Generated'),
          leading: IconButton(
            icon: const Icon(LucideIcons.arrow_left),
            onPressed: _goHome,
          ),
        ),
        body: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            image: DecorationImage(
              image: AssetImage('assets/background.png'),
              fit: BoxFit.cover,
            ),
          ),
          child: SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(
                      LucideIcons.circle_check,
                      color: Colors.green,
                      size: 96,
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Certificate Generated Successfully',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Color(0xFF12314D),
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (_message != 'Certificate generated successfully')
                      Text(
                        _message,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.grey,
                          fontSize: 14,
                        ),
                      ),
                    const SizedBox(height: 32),
                    ElevatedButton.icon(
                      onPressed: _pdfUri == null ? null : _openPdfWithViewer,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFF13546),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(
                        LucideIcons.download,
                        color: Colors.white,
                      ),
                      label: const Text(
                        'Download',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: _pdfUri == null ? null : _shareCertificate,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF12314D),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(LucideIcons.share, color: Colors.white),
                      label: const Text(
                        'Share',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: _scanNew,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFF13546),
                        side: const BorderSide(
                          color: Color(0xFFF13546),
                          width: 2,
                        ),
                        backgroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(
                        LucideIcons.scan_qr_code,
                        color: Color(0xFFF13546),
                      ),
                      label: const Text(
                        'Scan New QR Code',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HistoryItem {
  final String id;
  final DateTime generationDate;
  final int qrSerial;
  final String certificateNumber;
  final String vehicleNumber;
  final String oem;
  final String product;
  final String ownerName;
  final String? pdfUrl;

  _HistoryItem({
    required this.id,
    required this.generationDate,
    required this.qrSerial,
    required this.certificateNumber,
    required this.vehicleNumber,
    required this.oem,
    required this.product,
    required this.ownerName,
    required this.pdfUrl,
  });
}

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _refreshProfile();
  }

  Future<void> _refreshProfile() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await api.get('/auth/me');
      if (res.data != null && res.data is Map) {
        ApiSession.user = res.data as Map<String, dynamic>;
        await ApiSession.saveToStorage();
      }
      if (!mounted) return;
      setState(() {
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Failed to load profile';
      });
    }
  }

  String _stringVal(dynamic v) {
    if (v == null) return '-';
    final s = v.toString().trim();
    return s.isEmpty ? '-' : s;
  }

  String _oemsLabel(dynamic oems) {
    if (oems is List) {
      final parts = oems
          .map((e) {
            if (e is Map) return _stringVal(e['code'] ?? e['name']);
            return _stringVal(e);
          })
          .where((e) => e != '-')
          .toList();
      return parts.isEmpty ? '-' : parts.join(', ');
    }
    return _stringVal(oems);
  }

  Widget _tile(String label, String value, {IconData? icon}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          if (icon != null)
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: const Color(0xFF12314D).withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: const Color(0xFF12314D)),
            ),
          if (icon != null) const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: Colors.grey[600],
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    color: Color(0xFF12314D),
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final u = ApiSession.user;
    final dealerName = _stringVal(u?['name']);
    final phone = _stringVal(u?['phone']);
    final email = _stringVal(u?['email']);
    final state = _stringVal(u?['stateName'] ?? u?['stateCode']);
    final brands = _oemsLabel(u?['oems']);
    final passingRtosAll = (u?['passingRtosAll'] == true);
    final passingRtoCodes = u?['passingRtoCodes'];
    final passingRtos = passingRtosAll
        ? 'All'
        : passingRtoCodes is List
        ? passingRtoCodes
              .map((e) => _stringVal(e))
              .where((e) => e != '-')
              .join(', ')
        : '-';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF12314D),
        foregroundColor: Colors.white,
        title: const Text('Profile'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _refreshProfile,
            icon: const Icon(LucideIcons.refresh_cw),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _tile('Dealer Name', dealerName, icon: LucideIcons.badge),
                  const SizedBox(height: 12),
                  _tile('User ID (Phone)', phone, icon: LucideIcons.smartphone),
                  const SizedBox(height: 12),
                  _tile('Email', email, icon: LucideIcons.mail),
                  const SizedBox(height: 12),
                  _tile('Authorised State', state, icon: LucideIcons.map_pin),
                  const SizedBox(height: 12),
                  _tile('Authorised Brand(s)', brands, icon: LucideIcons.car),
                  const SizedBox(height: 12),
                  _tile(
                    'Passing RTO',
                    passingRtos,
                    icon: LucideIcons.building_2,
                  ),
                ],
              ),
            ),
      bottomNavigationBar: const DealerBottomNav(currentIndex: 2),
    );
  }
}

class SupportScreen extends StatelessWidget {
  const SupportScreen({super.key});

  Future<void> _openWhatsApp() async {
    final uri = Uri.parse('https://wa.me/?text=Hello%20SmartVahan%20Support');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Widget _categoryTile(IconData icon, String title) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: const Color(0xFF12314D).withOpacity(0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: const Color(0xFF12314D)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                color: Color(0xFF12314D),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF12314D),
        foregroundColor: Colors.white,
        title: const Text('Support'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              "We're here to help you move forward. Choose your preferred way to get in touch with our specialist team.",
              style: TextStyle(
                color: Color(0xFF91A8BD),
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFF7F8FA),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          color: const Color(0xFFF13546).withOpacity(0.12),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          LucideIcons.message_circle,
                          color: Color(0xFFF13546),
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Chat with us',
                              style: TextStyle(
                                color: Color(0xFF12314D),
                                fontWeight: FontWeight.w800,
                                fontSize: 20,
                              ),
                            ),
                            SizedBox(height: 6),
                            Text(
                              'Get answers to your technical queries and certificate-related support directly on WhatsApp.',
                              style: TextStyle(
                                color: Color(0xFF91A8BD),
                                fontWeight: FontWeight.w600,
                                height: 1.35,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _openWhatsApp,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFF13546),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Open WhatsApp Chat',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                          SizedBox(width: 10),
                          Icon(LucideIcons.arrow_right),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: const [
                      Icon(
                        LucideIcons.circle,
                        size: 8,
                        color: Color(0xFF10B981),
                      ),
                      SizedBox(width: 8),
                      Text(
                        'Typically responds in 30 mins',
                        style: TextStyle(
                          color: Color(0xFF91A8BD),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Support Hours: 9 AM to 5 PM',
                    style: TextStyle(
                      color: Color(0xFF91A8BD),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'COMMON CATEGORIES',
              style: TextStyle(
                color: Color(0xFF91A8BD),
                fontWeight: FontWeight.w800,
                letterSpacing: 1.1,
              ),
            ),
            const SizedBox(height: 12),
            _categoryTile(LucideIcons.settings, 'Installation Issues'),
            const SizedBox(height: 10),
            _categoryTile(LucideIcons.download, 'Certificate Downloads'),
            const SizedBox(height: 10),
            _categoryTile(LucideIcons.lock, 'Account Access'),
          ],
        ),
      ),
      bottomNavigationBar: const DealerBottomNav(currentIndex: 3),
    );
  }
}

class _HistoryScreenState extends State<HistoryScreen> {
  DateTime? _fromDate;
  DateTime? _toDate;
  final TextEditingController _searchController = TextEditingController();
  bool _loading = false;
  bool _hasLoadedOnce = false;
  String? _error;
  List<_HistoryItem> _items = [];
  List<_HistoryItem> _filteredItems = [];

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _toDate = now;
    _fromDate = now.subtract(const Duration(days: 7));
    _searchController.addListener(() {
      setState(() {
        _filteredItems = _filterItems(_items);
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _formatParamDate(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  String _formatDisplayDate(DateTime date) {
    final d = date.day.toString().padLeft(2, '0');
    final m = date.month.toString().padLeft(2, '0');
    final y = date.year.toString();
    return '$d-$m-$y';
  }

  Future<void> _pickFromDate() async {
    final initial = _fromDate ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2023, 1, 1),
      lastDate: DateTime.now(),
    );
    if (picked == null) {
      return;
    }
    setState(() {
      _fromDate = picked;
    });
  }

  Future<void> _pickToDate() async {
    final reference = _toDate ?? _fromDate ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: reference,
      firstDate: DateTime(2023, 1, 1),
      lastDate: DateTime.now(),
    );
    if (picked == null) {
      return;
    }
    setState(() {
      _toDate = picked;
    });
  }

  List<_HistoryItem> _filterItems(List<_HistoryItem> source) {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) {
      return List<_HistoryItem>.from(source);
    }
    return source
        .where(
          (e) =>
              e.qrSerial.toString().contains(query) ||
              e.vehicleNumber.toLowerCase().contains(query) ||
              e.certificateNumber.toLowerCase().contains(query) ||
              e.oem.toLowerCase().contains(query) ||
              e.product.toLowerCase().contains(query) ||
              e.ownerName.toLowerCase().contains(query),
        )
        .toList();
  }

  Future<void> _loadHistory() async {
    setState(() {
      _loading = true;
      _error = null;
      _hasLoadedOnce = true;
    });
    try {
      final params = <String, dynamic>{};
      if (_fromDate != null) {
        params['from'] = _formatParamDate(_fromDate!);
      }
      if (_toDate != null) {
        params['to'] = _formatParamDate(_toDate!);
      }
      final res = await api.get(
        '/certificates/download-list',
        queryParameters: params,
      );
      final raw = res.data;
      List<dynamic> list = [];
      if (raw is Map && raw['data'] is List) {
        list = raw['data'] as List<dynamic>;
      }
      final items = list.map((e) {
        final row = e as Map;
        final id = row['id']?.toString() ?? '';
        final dateStr = row['generationDate']?.toString();
        DateTime date;
        if (dateStr != null && dateStr.isNotEmpty) {
          try {
            date = DateTime.parse(dateStr);
          } catch (_) {
            date = DateTime.now();
          }
        } else {
          date = DateTime.now();
        }
        final qrRaw = row['qrSerial'];
        int qrSerial = 0;
        if (qrRaw is int) {
          qrSerial = qrRaw;
        } else if (qrRaw != null) {
          qrSerial = int.tryParse(qrRaw.toString()) ?? 0;
        }
        final certificateNumber = row['certificateNumber']?.toString() ?? '';
        final vehicleNumber = row['vehicleNumber']?.toString() ?? '';
        final oem = row['oem']?.toString() ?? '';
        final product = row['product']?.toString() ?? '';
        final ownerName = row['ownerName']?.toString() ?? '-';
        final pdfUrlRaw = row['pdfUrl']?.toString();
        String? pdfUrl;
        if (pdfUrlRaw != null && pdfUrlRaw.isNotEmpty) {
          if (pdfUrlRaw.startsWith('http')) {
            pdfUrl = pdfUrlRaw;
          } else {
            pdfUrl = 'https://smartvahan.net$pdfUrlRaw';
          }
        }
        return _HistoryItem(
          id: id,
          generationDate: date,
          qrSerial: qrSerial,
          certificateNumber: certificateNumber,
          vehicleNumber: vehicleNumber,
          oem: oem,
          product: product,
          ownerName: ownerName,
          pdfUrl: pdfUrl,
        );
      }).toList();
      setState(() {
        _items = items;
        _filteredItems = _filterItems(items);
        _loading = false;
      });
    } on DioException catch (e) {
      String message = 'Failed to load history';
      final resp = e.response;
      if (resp != null && resp.data is Map && resp.data['message'] != null) {
        message = resp.data['message'].toString();
      }
      setState(() {
        _loading = false;
        _error = message;
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _error = 'Network error while loading history';
      });
    }
  }

  Future<void> _openPdf(_HistoryItem item) async {
    final url = item.pdfUrl;
    if (url == null || url.isEmpty) {
      return;
    }
    try {
      await openPdfFromUrl(
        url,
        filenameHint: 'smartvahan_history_${item.qrSerial}',
      );
    } catch (_) {}
  }

  Widget _buildDateSelector(String label, DateTime? date, VoidCallback onTap) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                spreadRadius: 4,
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              const Icon(
                LucideIcons.calendar,
                color: Color(0xFF12314D),
                size: 20,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(color: Colors.grey[600], fontSize: 12),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      date == null ? 'Select Date' : _formatDisplayDate(date),
                      style: const TextStyle(
                        color: Color(0xFF12314D),
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoColumn(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 11)),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            color: Color(0xFF12314D),
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF12314D),
        foregroundColor: Colors.white,
        title: const Text('My Certificates'),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  offset: const Offset(0, 4),
                  blurRadius: 8,
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    _buildDateSelector('From Date', _fromDate, _pickFromDate),
                    const SizedBox(width: 12),
                    _buildDateSelector('To Date', _toDate, _pickToDate),
                  ],
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _loadHistory,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF12314D),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 2,
                  ),
                  child: const Text(
                    'Apply Filter',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        spreadRadius: 4,
                        blurRadius: 16,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      labelText: 'Search',
                      labelStyle: TextStyle(
                        color: Colors.grey[600],
                        fontSize: 14,
                      ),
                      prefixIcon: const Icon(
                        LucideIcons.search,
                        color: Color(0xFF12314D),
                      ),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 16,
                      ),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: const TextStyle(color: Colors.red, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _filteredItems.isEmpty
                ? Center(
                    child: Text(
                      _hasLoadedOnce
                          ? 'No certificates found.'
                          : 'Select a date range and click Apply Filter.',
                      style: const TextStyle(fontSize: 14, color: Colors.grey),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _filteredItems.length,
                    itemBuilder: (context, index) {
                      final item = _filteredItems[index];
                      return Container(
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.1),
                              spreadRadius: 2,
                              blurRadius: 10,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: _buildInfoColumn(
                                      'Date',
                                      _formatDisplayDate(item.generationDate),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _buildInfoColumn(
                                      'QR Code Serial',
                                      item.qrSerial.toString(),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: _buildInfoColumn(
                                      'Vehicle Number',
                                      item.vehicleNumber,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _buildInfoColumn('OEM', item.oem),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: _buildInfoColumn(
                                      'Product',
                                      item.product,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _buildInfoColumn(
                                      'Owner Name',
                                      item.ownerName,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton.icon(
                                  onPressed: item.pdfUrl == null
                                      ? null
                                      : () => _openPdf(item),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF12314D),
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 12,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    elevation: 0,
                                  ),
                                  icon: const Icon(
                                    LucideIcons.download,
                                    size: 18,
                                  ),
                                  label: const Text('Download Certificate'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
      bottomNavigationBar: const DealerBottomNav(currentIndex: 1),
    );
  }
}
