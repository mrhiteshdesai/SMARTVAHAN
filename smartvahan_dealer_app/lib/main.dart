import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:io';

import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:image/image.dart' as img;
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

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

void main() {
  runApp(const SmartvahanApp());
}

class LookupService {
  static List<dynamic>? vehicleCategories;
  static final Map<String, List<dynamic>> _rtosCache = {};

  static List<dynamic>? getRtos(String? stateCode) {
    if (stateCode == null || stateCode.isEmpty) return [];
    return _rtosCache[stateCode];
  }

  static void cacheRtos(String? stateCode, List<dynamic> data) {
    if (stateCode != null && stateCode.isNotEmpty) {
      _rtosCache[stateCode] = data;
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
          handler.next(options);
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
                                Icons.directions_car_filled,
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
                            'LOGIN',
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
                          'https://smartvahan.net/register',
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
                                    Icons.directions_car_filled_outlined,
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
                                    prefixIcon: Icon(
                                      Icons.phone_android_outlined,
                                    ),
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
                                    prefixIcon: Icon(Icons.lock_outline),
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
                              icon: const Icon(Icons.login),
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
      final res = await api.get('/auth/me');
      if (res.data != null && res.data is Map) {
        ApiSession.user = res.data as Map<String, dynamic>;
        await ApiSession.saveToStorage();
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
          IconButton(icon: const Icon(Icons.home_outlined), onPressed: () {}),
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
                        Icons.directions_car_filled,
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
              leading: const Icon(Icons.qr_code_scanner_outlined),
              title: const Text('Scan QR'),
              onTap: () {
                Navigator.of(context).pushNamed('/scan');
              },
            ),
            ListTile(
              leading: const Icon(Icons.history_outlined),
              title: const Text('History'),
              onTap: () {
                Navigator.of(context).pushNamed('/history');
              },
            ),
            ListTile(
              leading: const Icon(Icons.logout_outlined),
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

  @override
  void initState() {
    super.initState();
    _fetchStats();
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
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
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
                        Icons.qr_code_scanner_rounded,
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
            const SizedBox(height: 16),
            SizedBox(
              height: 110,
              child: Row(
                children: [
                  Expanded(
                    child: _buildActionButton(
                      'SLD',
                      isActive: false,
                      color: const Color(0xFF91A8BD),
                      icon: Icons.speed,
                      badge: true,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildActionButton(
                      'VLTD',
                      isActive: false,
                      color: const Color(0xFF91A8BD),
                      icon: Icons.gps_fixed,
                      badge: true,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildActionButton(
                      'History',
                      isActive: true,
                      icon: Icons.history,
                      onTap: () {
                        Navigator.of(context).pushNamed('/history');
                      },
                    ),
                  ),
                ],
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
              child: const Icon(Icons.lock, color: Colors.white, size: 12),
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

class _ScanScreenState extends State<ScanScreen> {
  bool _handling = false;
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    facing: CameraFacing.back,
    formats: const [BarcodeFormat.qrCode],
  );

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _scannerController.dispose();
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
              child: const Icon(Icons.close, color: Colors.red, size: 40),
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
            icon: const Icon(Icons.arrow_back),
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
                            child: Container(
                              width: 260,
                              height: 260,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: Colors.white.withOpacity(0.9),
                                  width: 2,
                                ),
                              ),
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
      15,
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
          _autoFillLocation();
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
        _chassisNoController.text.length != 5)
      return false;
    if (_engineNoController.text.isEmpty ||
        _engineNoController.text.length != 5)
      return false;
    if (_ownerNameController.text.isEmpty) return false;
    if (_ownerContactController.text.isEmpty ||
        _ownerContactController.text.length != 10)
      return false;
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

  Future<void> _autoFillLocation() async {
    if (_locationRequested || _locationController.text.isNotEmpty) return;
    _locationRequested = true;
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        return;
      }
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          return;
        }
      }
      if (permission == LocationPermission.deniedForever) {
        return;
      }
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      String? locationText;
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
            locationText = parts.join(', ');
          }
        }
      } catch (_) {}
      locationText ??=
          '${position.latitude.toStringAsFixed(5)}, ${position.longitude.toStringAsFixed(5)}';
      if (!mounted) return;
      if (_locationController.text.isEmpty) {
        _locationController.text = locationText;
      }
      _locationError = null;
      setState(() {});
    } catch (_) {
      if (!mounted) return;
      _locationError = 'Failed to detect location';
      setState(() {});
    }
  }

  Future<void> _loadLookups() async {
    if (_lookupsLoaded) return;

    final stateCode = _qrArgs?['stateCode']?.toString();

    // Check if we have everything we need in cache
    final needCats = LookupService.vehicleCategories == null;
    final needRtos =
        (stateCode != null && stateCode.isNotEmpty) &&
        LookupService.getRtos(stateCode) == null;

    if (!needCats && !needRtos) {
      if (!mounted) return;
      setState(() {
        _vehicleCategories = LookupService.vehicleCategories!;
        _rtos = LookupService.getRtos(stateCode) ?? [];
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
          LookupService.cacheRtos(
            stateCode,
            List<dynamic>.from(rtoRes.data as List),
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
      rtos.sort((a, b) {
        String nameA = (a is Map ? a['code'] : a).toString();
        String nameB = (b is Map ? b['code'] : b).toString();
        return nameA.compareTo(nameB);
      });
      setState(() {
        _vehicleCategories = LookupService.vehicleCategories ?? [];
        _rtos = rtos;
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
              child: const Icon(Icons.close, color: Colors.red, size: 40),
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
            initialValue: value,
            items: items,
            onChanged: onChanged,
            validator: validator,
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
            icon: const Icon(Icons.arrow_drop_down, color: Color(0xFF12314D)),
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
                : const Icon(Icons.image, color: Colors.grey, size: 40),
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
                    hasPhoto ? Icons.check_circle : Icons.camera_alt,
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
                : const Icon(Icons.image_not_supported, color: Colors.grey),
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
                  icon: const Icon(Icons.edit, color: Colors.white),
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
                      : const Icon(Icons.verified_user, color: Colors.white),
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
            icon: const Icon(Icons.arrow_back),
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
                                items: _rtos.map<DropdownMenuItem<String>>((e) {
                                  String val = '';
                                  if (e is Map) {
                                    val = e['code']?.toString() ?? e.toString();
                                  } else {
                                    val = e.toString();
                                  }
                                  return DropdownMenuItem(
                                    value: val,
                                    child: Text(val),
                                  );
                                }).toList(),
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
                                  String val = '';
                                  if (e is Map) {
                                    val = e['code']?.toString() ?? e.toString();
                                  } else {
                                    val = e.toString();
                                  }
                                  return DropdownMenuItem(
                                    value: val,
                                    child: Text(val),
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
                                  if (v.length != 5)
                                    return 'Must be 5 characters';
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
                                  if (v.length != 5)
                                    return 'Must be 5 characters';
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
                                Icons.verified_user,
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
        final file = File(
          '${dir.path}/smartvahan_certificate_${DateTime.now().millisecondsSinceEpoch}.pdf',
        );
        await file.writeAsBytes(data, flush: true);
        await OpenFilex.open(file.path, type: 'application/pdf');
      } else {
        await OpenFilex.open(url, type: 'application/pdf');
      }
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
            icon: const Icon(Icons.arrow_back),
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
                      Icons.check_circle_outline,
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
                      icon: const Icon(Icons.download, color: Colors.white),
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
                      icon: const Icon(Icons.share, color: Colors.white),
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
                        Icons.qr_code_scanner,
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
        final file = File(
          '${dir.path}/smartvahan_history_${item.qrSerial}_${DateTime.now().millisecondsSinceEpoch}.pdf',
        );
        await file.writeAsBytes(data, flush: true);
        await OpenFilex.open(file.path, type: 'application/pdf');
      } else {
        await OpenFilex.open(url, type: 'application/pdf');
      }
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
                Icons.calendar_today_outlined,
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
        title: const Text('History'),
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
                        Icons.search,
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
                                  icon: const Icon(Icons.download, size: 18),
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
    );
  }
}
