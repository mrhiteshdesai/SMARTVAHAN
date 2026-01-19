import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:io';

import 'package:flutter/material.dart';
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
    _timer = Timer(const Duration(seconds: 1), () async {
      if (!mounted) {
        return;
      }
      if (hasSession) {
        final activeSession = await LookupService.getActiveSession();
        if (!mounted) return;
        Navigator.of(
          context,
        ).pushNamedAndRemoveUntil('/home', (Route<dynamic> route) => false);
        if (activeSession != null) {
          Navigator.of(context).pushNamed('/form', arguments: activeSession);
        }
      } else {
        Navigator.of(context).pushReplacementNamed('/login');
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF12314D), Color(0xFF1F4060)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.directions_car_filled,
                color: Colors.white,
                size: 64,
              ),
              const SizedBox(height: 16),
              const Text(
                'SMARTVAHAN',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 4,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Dealer Fitment App',
                style: TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        ),
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
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF12314D), Color(0xFF1F4060)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.directions_car_filled,
                    color: Colors.white,
                    size: 56,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'SMARTVAHAN',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Secure Access For Authorised Dealers Only',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Login',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _phoneController,
                          keyboardType: TextInputType.phone,
                          maxLength: 10,
                          decoration: const InputDecoration(
                            labelText: 'Mobile Number',
                            hintText: '10 digit phone',
                            counterText: '',
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _passwordController,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Password',
                          ),
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            _error!,
                            style: const TextStyle(
                              color: Colors.red,
                              fontSize: 12,
                            ),
                          ),
                        ],
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _loading ? null : _submit,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFF13546),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(24),
                            ),
                          ),
                          child: Text(_loading ? 'Signing in...' : 'Sign In'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PhotoCaptureRow extends StatelessWidget {
  final String label;
  final String? imageData;
  final VoidCallback onCapture;

  const _PhotoCaptureRow({
    required this.label,
    required this.imageData,
    required this.onCapture,
  });

  @override
  Widget build(BuildContext context) {
    final hasImage = imageData != null && imageData!.isNotEmpty;
    Uint8List? thumbnailBytes;
    if (hasImage) {
      try {
        final raw = imageData!;
        final commaIndex = raw.indexOf(',');
        final base64Str = commaIndex != -1
            ? raw.substring(commaIndex + 1)
            : raw;
        thumbnailBytes = base64Decode(base64Str);
      } catch (_) {
        thumbnailBytes = null;
      }
    }

    return Row(
      children: [
        Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
        const SizedBox(width: 8),
        if (thumbnailBytes != null)
          Container(
            width: 56,
            height: 56,
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: Colors.black12,
              borderRadius: BorderRadius.circular(8),
            ),
            clipBehavior: Clip.antiAlias,
            child: Image.memory(thumbnailBytes, fit: BoxFit.cover),
          ),
        ElevatedButton(
          onPressed: onCapture,
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          ),
          child: Text(hasImage ? 'Re-capture' : 'Capture'),
        ),
      ],
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  String _dealerTitle() {
    final u = ApiSession.user;
    if (u == null) return 'Dealer';
    if (u['name'] != null && u['name'].toString().isNotEmpty) {
      return u['name'].toString();
    }
    if (u['phone'] != null) {
      return u['phone'].toString();
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
            DrawerHeader(
              decoration: const BoxDecoration(color: Color(0xFF12314D)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    _dealerTitle(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _dealerSubtitle(),
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(Icons.qr_code_scanner),
              title: const Text('Scan QR'),
              onTap: () {
                Navigator.of(context).pushNamed('/scan');
              },
            ),
            ListTile(
              leading: const Icon(Icons.history),
              title: const Text('History'),
              onTap: () {
                Navigator.of(context).pushNamed('/history');
              },
            ),
            ListTile(
              leading: const Icon(Icons.logout),
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
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF12314D), Color(0xFF1F4060)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white24),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Today's Summary",
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Fitments Today: 0   •   This Week: 0',
                        style: TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      ElevatedButton.icon(
                        onPressed: () {
                          Navigator.of(context).pushNamed('/scan');
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFF13546),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 14,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(24),
                          ),
                        ),
                        icon: const Icon(Icons.qr_code_scanner),
                        label: const Text(
                          'Scan QR',
                          style: TextStyle(fontSize: 16),
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
  String? _error;
  final MobileScannerController _scannerController = MobileScannerController(
    cameraResolution: Size(1920, 1080),
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

  Future<void> _handleQr(String value) async {
    if (_handling) return;
    setState(() {
      _handling = true;
      _error = null;
    });

    try {
      final res = await api.post(
        '/certificates/validate-qr',
        data: {'qrContent': value},
      );
      final data = res.data as Map;
      final success = data['success'] == true;
      if (!success) {
        setState(() {
          _handling = false;
          _error = 'Invalid QR';
        });
        return;
      }
      final qrData = data['data'] as Map?;
      if (!mounted) return;
      Navigator.of(context).pushNamed(
        '/form',
        arguments: qrData != null ? Map<String, dynamic>.from(qrData) : null,
      );
      setState(() {
        _handling = false;
      });
    } on DioException catch (e) {
      String message = 'Validation failed';
      final resp = e.response;
      if (resp != null && resp.data is Map && resp.data['message'] != null) {
        message = resp.data['message'].toString();
      }
      setState(() {
        _handling = false;
        _error = message;
      });
    } catch (_) {
      setState(() {
        _handling = false;
        _error = 'Network error';
      });
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
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.red, fontSize: 12),
                  ),
                ),
            ],
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
        _locationController.text = locationText!;
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
      if (needRtos && stateCode != null) {
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
      setState(() {
        _vehicleCategories = LookupService.vehicleCategories ?? [];
        _rtos = LookupService.getRtos(stateCode) ?? [];
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

  @override
  void dispose() {
    _vehicleMakeController.dispose();
    _vehicleCategoryController.dispose();
    _fuelTypeController.dispose();
    _passingRtoController.dispose();
    _registrationRtoController.dispose();
    _seriesController.dispose();
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

  Future<void> _submitForm() async {
    final currentState = _formKey.currentState;
    if (currentState == null) return;
    if (!currentState.validate()) return;

    final qrValue = _qrArgs?['value']?.toString();
    if (qrValue == null || qrValue.isEmpty) {
      setState(() {
        _error = 'Missing QR value from scan. Please rescan.';
        _success = null;
      });
      return;
    }

    final missingPhoto = _photos.values.any(
      (value) => value == null || value.isEmpty,
    );
    if (missingPhoto) {
      setState(() {
        _error = 'Please capture all fitment photos before submitting.';
        _success = null;
      });
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

    try {
      final res = await api.post('/certificates/create', data: payload);
      final data = res.data as Map;
      final success = data['success'] == true;
      if (success) {
        final msg = data['message']?.toString() ?? 'Certificate generated';
        final pdfUrlRaw = data['pdfUrl']?.toString();
        final baseUrl = 'https://smartvahan.net';
        final fullUrl = pdfUrlRaw != null && pdfUrlRaw.isNotEmpty
            ? (pdfUrlRaw.startsWith('http') ? pdfUrlRaw : '$baseUrl$pdfUrlRaw')
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
      } else {
        setState(() {
          _submitting = false;
          _error =
              data['message']?.toString() ?? 'Failed to generate certificate';
        });
      }
    } on DioException catch (e) {
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
        _error = message;
      });
    } catch (_) {
      setState(() {
        _submitting = false;
        _error = 'Network error';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final args = _qrArgs ?? {};
    final qrSerial = args['serialNumber']?.toString();
    final stateCode = args['stateCode']?.toString();
    final product = args['product']?.toString();
    final batchId = args['batchId']?.toString();
    final oemName = args['oemName']?.toString();
    final qrValue = args['value']?.toString();

    return WillPopScope(
      onWillPop: () async {
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
          title: const Text('Fitment Form'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () async {
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
            gradient: LinearGradient(
              colors: [Color(0xFF12314D), Color(0xFF1F4060)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: SafeArea(
            child: _initializing
                ? const Center(child: CircularProgressIndicator())
                : SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (qrSerial != null)
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: Colors.white24),
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'QR Details',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        'Serial: $qrSerial',
                                        style: const TextStyle(
                                          color: Colors.white70,
                                        ),
                                      ),
                                      if (qrValue != null)
                                        Text(
                                          'QR Value: $qrValue',
                                          style: const TextStyle(
                                            color: Colors.white70,
                                          ),
                                        ),
                                      if (oemName != null)
                                        Text(
                                          'OEM: $oemName',
                                          style: const TextStyle(
                                            color: Colors.white70,
                                          ),
                                        ),
                                      if (stateCode != null)
                                        Text(
                                          'State: $stateCode',
                                          style: const TextStyle(
                                            color: Colors.white70,
                                          ),
                                        ),
                                      if (product != null)
                                        Text(
                                          'Product: $product',
                                          style: const TextStyle(
                                            color: Colors.white70,
                                          ),
                                        ),
                                      if (batchId != null)
                                        Text(
                                          'Batch: $batchId',
                                          style: const TextStyle(
                                            color: Colors.white70,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 16),
                              ],
                            ),
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Text(
                                  'Vehicle Details',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<String>(
                                  initialValue:
                                      _vehicleMakeController.text.isEmpty
                                      ? null
                                      : _vehicleMakeController.text,
                                  items: _vehicleMakes
                                      .map(
                                        (m) => DropdownMenuItem<String>(
                                          value: m,
                                          child: Text(m),
                                        ),
                                      )
                                      .toList(),
                                  decoration: const InputDecoration(
                                    labelText: 'Vehicle Make',
                                  ),
                                  onChanged: (value) {
                                    setState(() {
                                      _vehicleMakeController.text = value ?? '';
                                    });
                                  },
                                  validator: (v) =>
                                      v == null || v.trim().isEmpty
                                      ? 'Select vehicle make'
                                      : null,
                                ),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<String>(
                                  initialValue:
                                      _vehicleCategoryController.text.isEmpty
                                      ? null
                                      : _vehicleCategoryController.text,
                                  items: _vehicleCategories
                                      .map(
                                        (c) => DropdownMenuItem<String>(
                                          value: c['name']?.toString() ?? '',
                                          child: Text(
                                            c['name']?.toString() ?? '',
                                          ),
                                        ),
                                      )
                                      .toList(),
                                  decoration: InputDecoration(
                                    labelText: 'Vehicle Category',
                                    suffixIcon: _loadingLookups
                                        ? const SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: Padding(
                                              padding: EdgeInsets.all(8),
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                              ),
                                            ),
                                          )
                                        : null,
                                  ),
                                  onChanged: _loadingLookups
                                      ? null
                                      : (value) {
                                          setState(() {
                                            _vehicleCategoryController.text =
                                                value ?? '';
                                          });
                                        },
                                  validator: (v) =>
                                      v == null || v.trim().isEmpty
                                      ? 'Select vehicle category'
                                      : null,
                                ),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<String>(
                                  initialValue: _fuelTypeController.text.isEmpty
                                      ? null
                                      : _fuelTypeController.text,
                                  items: _fuelTypes
                                      .map(
                                        (f) => DropdownMenuItem<String>(
                                          value: f,
                                          child: Text(f),
                                        ),
                                      )
                                      .toList(),
                                  decoration: const InputDecoration(
                                    labelText: 'Fuel Type',
                                  ),
                                  onChanged: (value) {
                                    setState(() {
                                      _fuelTypeController.text = value ?? '';
                                    });
                                  },
                                  validator: (v) =>
                                      v == null || v.trim().isEmpty
                                      ? 'Select fuel type'
                                      : null,
                                ),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<String>(
                                  initialValue:
                                      _passingRtoController.text.isEmpty
                                      ? null
                                      : _passingRtoController.text,
                                  items: _rtos
                                      .map(
                                        (r) => DropdownMenuItem<String>(
                                          value: r['code']?.toString() ?? '',
                                          child: Text(
                                            '${r['code'] ?? ''} - ${r['name'] ?? ''}',
                                          ),
                                        ),
                                      )
                                      .toList(),
                                  decoration: InputDecoration(
                                    labelText: 'Passing RTO',
                                    suffixIcon: _loadingLookups
                                        ? const SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: Padding(
                                              padding: EdgeInsets.all(8),
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                              ),
                                            ),
                                          )
                                        : null,
                                  ),
                                  onChanged: _loadingLookups
                                      ? null
                                      : (value) {
                                          setState(() {
                                            _passingRtoController.text =
                                                value ?? '';
                                          });
                                        },
                                  validator: (v) =>
                                      v == null || v.trim().isEmpty
                                      ? 'Select passing RTO'
                                      : null,
                                ),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<String>(
                                  initialValue:
                                      _registrationRtoController.text.isEmpty
                                      ? null
                                      : _registrationRtoController.text,
                                  items: _rtos
                                      .map(
                                        (r) => DropdownMenuItem<String>(
                                          value: r['code']?.toString() ?? '',
                                          child: Text(
                                            '${r['code'] ?? ''} - ${r['name'] ?? ''}',
                                          ),
                                        ),
                                      )
                                      .toList(),
                                  decoration: InputDecoration(
                                    labelText: 'Registration RTO',
                                    suffixIcon: _loadingLookups
                                        ? const SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: Padding(
                                              padding: EdgeInsets.all(8),
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                              ),
                                            ),
                                          )
                                        : null,
                                  ),
                                  onChanged: _loadingLookups
                                      ? null
                                      : (value) {
                                          setState(() {
                                            _registrationRtoController.text =
                                                value ?? '';
                                          });
                                        },
                                  validator: (v) =>
                                      v == null || v.trim().isEmpty
                                      ? 'Select registration RTO'
                                      : null,
                                ),
                                if (_lookupError != null) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    _lookupError!,
                                    style: const TextStyle(
                                      color: Colors.red,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 8),
                                TextFormField(
                                  controller: _seriesController,
                                  decoration: const InputDecoration(
                                    labelText: 'Series',
                                  ),
                                  validator: (v) =>
                                      v == null || v.trim().isEmpty
                                      ? 'Enter series'
                                      : null,
                                ),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<String>(
                                  initialValue:
                                      _manufacturingYearController.text.isEmpty
                                      ? null
                                      : _manufacturingYearController.text,
                                  items: _years
                                      .map(
                                        (y) => DropdownMenuItem<String>(
                                          value: y,
                                          child: Text(y),
                                        ),
                                      )
                                      .toList(),
                                  decoration: const InputDecoration(
                                    labelText: 'Manufacturing Year',
                                  ),
                                  onChanged: (value) {
                                    setState(() {
                                      _manufacturingYearController.text =
                                          value ?? '';
                                    });
                                  },
                                  validator: (v) =>
                                      v == null || v.trim().isEmpty
                                      ? 'Select year'
                                      : null,
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  controller: _chassisNoController,
                                  maxLength: 5,
                                  decoration: const InputDecoration(
                                    labelText: 'Chassis No (Last 5)',
                                    counterText: '',
                                  ),
                                  validator: (v) =>
                                      v == null || v.trim().length != 5
                                      ? 'Enter last 5 digits'
                                      : null,
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  controller: _engineNoController,
                                  maxLength: 5,
                                  decoration: const InputDecoration(
                                    labelText: 'Engine No (Last 5)',
                                    counterText: '',
                                  ),
                                  validator: (v) =>
                                      v == null || v.trim().length != 5
                                      ? 'Enter last 5 digits'
                                      : null,
                                ),
                                const SizedBox(height: 16),
                                const Text(
                                  'Fitment Photos',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Column(
                                  children: [
                                    _PhotoCaptureRow(
                                      label: 'Front Left',
                                      imageData: _photos['photoFrontLeft'],
                                      onCapture: () =>
                                          _capturePhoto('photoFrontLeft'),
                                    ),
                                    const SizedBox(height: 8),
                                    _PhotoCaptureRow(
                                      label: 'Back Right',
                                      imageData: _photos['photoBackRight'],
                                      onCapture: () =>
                                          _capturePhoto('photoBackRight'),
                                    ),
                                    const SizedBox(height: 8),
                                    _PhotoCaptureRow(
                                      label: 'Number Plate',
                                      imageData: _photos['photoNumberPlate'],
                                      onCapture: () =>
                                          _capturePhoto('photoNumberPlate'),
                                    ),
                                    const SizedBox(height: 8),
                                    _PhotoCaptureRow(
                                      label: 'RC / Document',
                                      imageData: _photos['photoRc'],
                                      onCapture: () => _capturePhoto('photoRc'),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 16),
                                const Text(
                                  'Owner Details',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  controller: _ownerNameController,
                                  decoration: const InputDecoration(
                                    labelText: 'Owner Name',
                                  ),
                                  validator: (v) =>
                                      v == null || v.trim().isEmpty
                                      ? 'Enter owner name'
                                      : null,
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  controller: _ownerContactController,
                                  keyboardType: TextInputType.phone,
                                  maxLength: 10,
                                  decoration: const InputDecoration(
                                    labelText: 'Owner Phone',
                                    counterText: '',
                                  ),
                                  validator: (v) {
                                    final value = v?.trim() ?? '';
                                    if (value.isEmpty) {
                                      return 'Enter owner phone';
                                    }
                                    if (value.length != 10) {
                                      return 'Enter 10 digit phone';
                                    }
                                    return null;
                                  },
                                ),
                                const SizedBox(height: 16),
                                TextFormField(
                                  controller: _locationController,
                                  decoration: InputDecoration(
                                    labelText: 'Location (optional)',
                                    suffixIcon: _locationError != null
                                        ? const Icon(
                                            Icons.location_off,
                                            size: 18,
                                            color: Colors.redAccent,
                                          )
                                        : const Icon(
                                            Icons.my_location,
                                            size: 18,
                                            color: Color(0xFF12314D),
                                          ),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                if (_error != null)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: Text(
                                      _error!,
                                      style: const TextStyle(
                                        color: Colors.red,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                if (_success != null)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: Text(
                                      _success!,
                                      style: const TextStyle(
                                        color: Colors.green,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                ElevatedButton(
                                  onPressed: _submitting ? null : _submitForm,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFFF13546),
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 12,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(24),
                                    ),
                                  ),
                                  child: Text(
                                    _submitting
                                        ? 'Generating...'
                                        : 'Generate Certificate',
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
            gradient: LinearGradient(
              colors: [Color(0xFF12314D), Color(0xFF1F4060)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
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
                      Icons.check_circle,
                      color: Colors.white,
                      size: 72,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      _message,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 32),
                    ElevatedButton(
                      onPressed: _pdfUri == null ? null : _openPdfWithViewer,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: const Color(0xFF12314D),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                      ),
                      child: const Text('Download'),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton(
                      onPressed: _pdfUri == null ? null : _shareCertificate,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFF13546),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                      ),
                      child: const Text('Share'),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: _scanNew,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white70),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                      ),
                      child: const Text('Scan New QR Code'),
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
  final String? pdfUrl;

  _HistoryItem({
    required this.id,
    required this.generationDate,
    required this.qrSerial,
    required this.certificateNumber,
    required this.vehicleNumber,
    required this.oem,
    required this.product,
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
              e.product.toLowerCase().contains(query),
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
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('From'),
                          const SizedBox(height: 4),
                          OutlinedButton(
                            onPressed: _pickFromDate,
                            child: Text(
                              _fromDate == null
                                  ? 'Select Date'
                                  : _formatDisplayDate(_fromDate!),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('To'),
                          const SizedBox(height: 4),
                          OutlinedButton(
                            onPressed: _pickToDate,
                            child: Text(
                              _toDate == null
                                  ? 'Select Date'
                                  : _formatDisplayDate(_toDate!),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(
                    labelText: 'Search (QR / Vehicle / OEM / Product)',
                    prefixIcon: Icon(Icons.search),
                  ),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: ElevatedButton(
                    onPressed: _loadHistory,
                    child: const Text('Apply Date Range'),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _error!,
                    style: const TextStyle(color: Colors.red, fontSize: 12),
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
                          : 'Select a date range and click Apply.',
                      style: const TextStyle(fontSize: 14),
                    ),
                  )
                : ListView.builder(
                    itemCount: _filteredItems.length,
                    itemBuilder: (context, index) {
                      final item = _filteredItems[index];
                      return Card(
                        margin: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'QR Serial: ${item.qrSerial}',
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    _formatDisplayDate(item.generationDate),
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Vehicle: ${item.vehicleNumber}',
                                style: const TextStyle(fontSize: 13),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'OEM: ${item.oem}',
                                style: const TextStyle(fontSize: 12),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Product: ${item.product}',
                                style: const TextStyle(fontSize: 12),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Certificate: ${item.certificateNumber}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Colors.black87,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Align(
                                alignment: Alignment.centerRight,
                                child: ElevatedButton(
                                  onPressed: item.pdfUrl == null
                                      ? null
                                      : () => _openPdf(item),
                                  child: const Text('Download Certificate'),
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
