import 'dart:convert';
import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';

import 'package:share_plus/share_plus.dart';

import '../api_holder.dart';
import '../dealer_nav.dart';
import '../platform/pdf_opener.dart';

class SldFormScreen extends StatefulWidget {
  final bool isRenewal;
  const SldFormScreen({super.key, this.isRenewal = false});

  @override
  State<SldFormScreen> createState() => _SldFormScreenState();
}

class _SldFormScreenState extends State<SldFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _imagePicker = ImagePicker();
  final _verifyScrollController = ScrollController();

  bool get _isRenewal => widget.isRenewal;

  bool _loadingMeta = true;
  bool _loadingLookups = false;
  bool _submitting = false;
  bool _isVerifying = false;
  bool _consentGiven = false;
  String? _error;
  String? _lookupError;
  String? _locationError;

  List<dynamic> _oems = [];
  int _renewalCredits = 0;
  bool _adminTestMode = false;
  String? _prefillNote;
  String? _oemId;
  String? _modelId;
  List<dynamic> _serials = [];
  String? _serialId;
  final _serialManualCtrl = TextEditingController();
  List<dynamic> _approvedVehicles = [];
  String? _vehicleMake;
  String? _approvedVehicleModelId;

  List<dynamic> _rtos = [];
  List<dynamic> _passingRtos = [];

  final _sealCtrl = TextEditingController();
  final _ownerNameCtrl = TextEditingController();
  final _ownerPhoneCtrl = TextEditingController();
  final _regRtoCtrl = TextEditingController();
  final _seriesCtrl = TextEditingController();
  final _vehicleNumberCtrl = TextEditingController();
  final _chassisCtrl = TextEditingController();
  final _engineCtrl = TextEditingController();
  final _yearCtrl = TextEditingController();
  final _passingRtoCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();

  final Map<String, String?> _photos = {
    'photoPlate': null,
    'photoInstalled': null,
    'photoSeal': null,
    'photoSerial': null,
  };

  double? _lat;
  double? _lng;

  late final List<String> _years;

  final _upperCaseFormatter = TextInputFormatter.withFunction((oldValue, newValue) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  });

  List<dynamic> get _models {
    if (_oemId == null) return [];
    final oem = _oems.cast<Map>().firstWhere(
      (o) => o['id'] == _oemId,
      orElse: () => <String, dynamic>{},
    );
    return List<dynamic>.from(oem['models'] ?? []);
  }

  String get _oemLabel {
    final oem = _oems.cast<Map>().firstWhere(
      (o) => o['id'] == _oemId,
      orElse: () => <String, dynamic>{},
    );
    final name = oem['name']?.toString() ?? '';
    final code = oem['code']?.toString() ?? '';
    if (name.isEmpty) return '-';
    return code.isNotEmpty ? '$name ($code)' : name;
  }

  String get _modelLabel {
    final model = _models.cast<Map>().firstWhere(
      (m) => m['id'] == _modelId,
      orElse: () => <String, dynamic>{},
    );
    final name = model['name']?.toString() ?? '';
    final code = model['code']?.toString() ?? '';
    if (name.isEmpty) return '-';
    return code.isNotEmpty ? '$name ($code)' : name;
  }

  String get _serialLabel {
    if (_isRenewal) {
      final typed = _serialManualCtrl.text.trim().toUpperCase();
      return typed.isEmpty ? '-' : typed;
    }
    final serial = _serials.cast<Map>().firstWhere(
      (s) => s['id'] == _serialId,
      orElse: () => <String, dynamic>{},
    );
    return serial['serialNumber']?.toString() ?? '-';
  }

  String get _vehicleModelLabel {
    final row = _approvedVehicles.cast<Map>().firstWhere(
      (m) => m['id'] == _approvedVehicleModelId,
      orElse: () => <String, dynamic>{},
    );
    final name = row['modelName']?.toString() ?? '-';
    final speed = row['setSpeedKmph'];
    if (speed == null) return name;
    return '$name ($speed km/h)';
  }

  List<String> get _makes {
    final set = <String>{};
    for (final row in _approvedVehicles) {
      if (row is! Map) continue;
      final make = (row['make'] ?? '').toString().trim();
      if (make.isNotEmpty) set.add(make);
    }
    final list = set.toList()..sort();
    return list;
  }

  List<Map> get _modelsForMake {
    if (_vehicleMake == null || _vehicleMake!.isEmpty) return [];
    return _approvedVehicles
        .whereType<Map>()
        .where((r) => (r['make'] ?? '').toString().trim() == _vehicleMake)
        .toList();
  }

  @override
  void initState() {
    super.initState();
    final current = DateTime.now().year;
    _years = List<String>.generate(current - 1960 + 1, (i) => (current - i).toString());
    _regRtoCtrl.addListener(_updateVehicleNumber);
    _seriesCtrl.addListener(_updateVehicleNumber);
    _init();
  }

  @override
  void dispose() {
    _verifyScrollController.dispose();
    _sealCtrl.dispose();
    _ownerNameCtrl.dispose();
    _ownerPhoneCtrl.dispose();
    _regRtoCtrl.dispose();
    _seriesCtrl.dispose();
    _vehicleNumberCtrl.dispose();
    _chassisCtrl.dispose();
    _engineCtrl.dispose();
    _yearCtrl.dispose();
    _passingRtoCtrl.dispose();
    _locationCtrl.dispose();
    _serialManualCtrl.dispose();
    super.dispose();
  }

  void _updateVehicleNumber() {
    final rto = _regRtoCtrl.text.trim().toUpperCase();
    final series = _seriesCtrl.text.trim().toUpperCase();
    _vehicleNumberCtrl.text = '$rto$series';
  }

  Future<void> _init() async {
    setState(() {
      _loadingMeta = true;
      _error = null;
    });
    try {
      final res = await ApiHolder.api.get('/sld/dealer/bootstrap');
      final data = Map<String, dynamic>.from(res.data as Map);
      if (!mounted) return;
      final credit = data['renewalCreditBalance'];
      final oemsRaw = _isRenewal
          ? (data['renewalOems'] ?? data['oems'] ?? [])
          : (data['oems'] ?? []);
      setState(() {
        _oems = List<dynamic>.from(oemsRaw as List);
        _adminTestMode = data['adminTestMode'] == true || dealerIsSystemAdmin();
        _renewalCredits = credit is int
            ? credit
            : int.tryParse('$credit') ?? (_adminTestMode ? 0 : 0);
        _loadingMeta = false;
        if (_oems.isEmpty) {
          _error = dealerIsSystemAdmin()
              ? 'No SLD OEMs configured in the system.'
              : (_isRenewal
                  ? 'No SLD OEMs available for renewal.'
                  : 'No SLD OEM authorized for this dealer.');
        } else if (_isRenewal && !_adminTestMode && _renewalCredits < 1) {
          _error = 'No renewal credits remaining. Contact platform owner to top up.';
        }
      });
      await Future.wait([_loadLookups(), _ensureLocation()]);
    } on DioException catch (e) {
      final msg = e.response?.data is Map && e.response?.data['message'] != null
          ? e.response!.data['message'].toString()
          : (e.message ?? 'Failed to load SLD data');
      if (!mounted) return;
      setState(() {
        _error = msg;
        _loadingMeta = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load SLD data';
        _loadingMeta = false;
      });
    }
  }

  Future<void> _loadLookups() async {
    final stateCode = ApiHolder.user?['stateCode']?.toString().trim();
    if (stateCode == null || stateCode.isEmpty) return;

    setState(() {
      _loadingLookups = true;
      _lookupError = null;
    });

    try {
      final results = await Future.wait<Response>([
        ApiHolder.api.get('/rtos', queryParameters: {'stateCode': stateCode}),
        ApiHolder.api.get('/rtos/authorized', queryParameters: {'stateCode': stateCode}),
      ]);

      List<dynamic> sortRtos(dynamic raw) {
        final list = raw is List ? List<dynamic>.from(raw) : <dynamic>[];
        list.sort((a, b) {
          final rawA = a is Map ? (a['code'] ?? '') : a;
          final rawB = b is Map ? (b['code'] ?? '') : b;
          return rawA.toString().toLowerCase().compareTo(rawB.toString().toLowerCase());
        });
        return list;
      }

      if (!mounted) return;
      setState(() {
        _rtos = sortRtos(results[0].data);
        _passingRtos = sortRtos(results[1].data);
        _loadingLookups = false;
      });
    } on DioException catch (e) {
      final msg = e.response?.data is Map && e.response?.data['message'] != null
          ? e.response!.data['message'].toString()
          : 'Failed to load RTO options';
      if (!mounted) return;
      setState(() {
        _loadingLookups = false;
        _lookupError = msg;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingLookups = false;
        _lookupError = 'Failed to load RTO options';
      });
    }
  }

  Future<void> _ensureLocation() async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        setState(() => _locationError = 'Location services are disabled');
        return;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        setState(() => _locationError = 'Location permission not granted');
        return;
      }
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      _lat = pos.latitude;
      _lng = pos.longitude;
      String address = '';
      try {
        final marks = await placemarkFromCoordinates(pos.latitude, pos.longitude);
        if (marks.isNotEmpty) {
          final p = marks.first;
          address = [
            p.street,
            p.subLocality,
            p.locality,
            p.administrativeArea,
            p.postalCode,
          ].where((e) => (e ?? '').trim().isNotEmpty).join(', ');
        }
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _locationCtrl.text =
            '${address.isEmpty ? 'Location' : address} | Lat: ${_lat!.toStringAsFixed(5)}, Lng: ${_lng!.toStringAsFixed(5)}';
        _locationError = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _locationError = 'Unable to fetch location');
    }
  }

  Future<void> _loadSerials() async {
    if (_oemId == null || _modelId == null) return;
    try {
      final res = await ApiHolder.api.get(
        '/sld/dealer/serials',
        queryParameters: {'sldOemId': _oemId, 'modelId': _modelId},
      );
      final list = res.data is List ? List<dynamic>.from(res.data as List) : <dynamic>[];
      if (!mounted) return;
      setState(() {
        _serials = list;
        _serialId = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _serials = [];
        _serialId = null;
      });
    }
  }

  Future<void> _loadVehicleModels() async {
    if (_modelId == null) return;
    try {
      final res = await ApiHolder.api.get('/sld/models/$_modelId/vehicle-models');
      final list = res.data is List ? List<dynamic>.from(res.data as List) : <dynamic>[];
      if (!mounted) return;
      setState(() {
        _approvedVehicles = list;
        _vehicleMake = null;
        _approvedVehicleModelId = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _approvedVehicles = [];
        _vehicleMake = null;
        _approvedVehicleModelId = null;
      });
    }
  }

  /// Prefill vehicle/owner from latest prior SmartVahan cert for OEM+serial (editable).
  Future<void> _tryPrefillPriorCert() async {
    if (!_isRenewal || _oemId == null) return;
    final serial = _serialManualCtrl.text.trim().toUpperCase();
    if (serial.isEmpty) {
      setState(() => _prefillNote = null);
      return;
    }
    try {
      final res = await ApiHolder.api.get(
        '/sld/dealer/prior-certificate',
        queryParameters: {'sldOemId': _oemId, 'serialNumber': serial},
      );
      final data = Map<String, dynamic>.from(res.data as Map? ?? {});
      if (!mounted) return;
      if (data['found'] != true) {
        setState(() => _prefillNote = 'No prior SmartVahan certificate — enter details manually.');
        return;
      }

      final make = (data['vehicleMake'] ?? '').toString().trim();
      final category = (data['vehicleCategory'] ?? '').toString().trim();
      final speed = data['setSpeedKmph'];
      String? approvedId;
      for (final row in _approvedVehicles.whereType<Map>()) {
        final rMake = (row['make'] ?? '').toString().trim();
        final rModel = (row['modelName'] ?? '').toString().trim();
        final rSpeed = row['setSpeedKmph'];
        if (rMake == make && rModel == category && '$rSpeed' == '$speed') {
          approvedId = row['id']?.toString();
          break;
        }
      }
      if (approvedId == null && make.isNotEmpty) {
        for (final row in _approvedVehicles.whereType<Map>()) {
          if ((row['make'] ?? '').toString().trim() == make &&
              (row['modelName'] ?? '').toString().trim() == category) {
            approvedId = row['id']?.toString();
            break;
          }
        }
      }

      setState(() {
        _regRtoCtrl.text = (data['registrationRto'] ?? '').toString().toUpperCase();
        _seriesCtrl.text = (data['series'] ?? '').toString().toUpperCase();
        final vn = (data['vehicleNumber'] ?? '').toString().toUpperCase();
        if (vn.isNotEmpty) _vehicleNumberCtrl.text = vn;
        _chassisCtrl.text = (data['chassisNumber'] ?? '').toString().toUpperCase();
        _engineCtrl.text = (data['engineNumber'] ?? '').toString().toUpperCase();
        _yearCtrl.text = (data['manufacturingYear'] ?? '').toString();
        _passingRtoCtrl.text = (data['passingRto'] ?? '').toString().toUpperCase();
        _ownerNameCtrl.text = (data['ownerName'] ?? '').toString().toUpperCase();
        _ownerPhoneCtrl.text = (data['ownerContact'] ?? '').toString();
        _sealCtrl.text = (data['sealNumber'] ?? '').toString();
        if (make.isNotEmpty) _vehicleMake = make;
        if (approvedId != null) _approvedVehicleModelId = approvedId;
        _prefillNote =
            'Prefilled from ${data['certificateNumber']} (${data['kind'] ?? 'prior'}). Editable.';
      });
      _updateVehicleNumber();
    } catch (_) {
      if (!mounted) return;
      setState(() => _prefillNote = null);
    }
  }

  Future<void> _capture(String key) async {
    try {
      final file = await _imagePicker.pickImage(source: ImageSource.camera, imageQuality: 70);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final decoded = img.decodeImage(bytes);
      if (decoded == null) return;
      var resized = decoded;
      if (decoded.width > 1280) {
        resized = img.copyResize(decoded, width: 1280);
      }
      final jpg = img.encodeJpg(resized, quality: 75);
      final dataUrl = 'data:image/jpeg;base64,${base64Encode(jpg)}';
      if (!mounted) return;
      setState(() => _photos[key] = dataUrl);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not capture photo. Try again.')),
      );
    }
  }

  bool get _isFormFilled {
    final serialOk = _isRenewal
        ? _serialManualCtrl.text.trim().isNotEmpty
        : _serialId != null;
    return _oemId != null &&
        _modelId != null &&
        serialOk &&
        _sealCtrl.text.trim().isNotEmpty &&
        _vehicleMake != null &&
        _approvedVehicleModelId != null &&
        _yearCtrl.text.isNotEmpty &&
        _passingRtoCtrl.text.isNotEmpty &&
        _regRtoCtrl.text.isNotEmpty &&
        _seriesCtrl.text.trim().isNotEmpty &&
        _chassisCtrl.text.trim().length == 5 &&
        _engineCtrl.text.trim().length == 5 &&
        _ownerNameCtrl.text.trim().isNotEmpty &&
        _ownerPhoneCtrl.text.trim().length == 10 &&
        _locationCtrl.text.trim().isNotEmpty &&
        _photos.values.every((v) => v != null && v.isNotEmpty);
  }

  void _goToVerify() {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) {
      _showErrorDialog('Please fill all required fields correctly.');
      return;
    }
    if (!_isFormFilled) {
      final missingPhoto = _photos.values.any((v) => v == null || v.isEmpty);
      _showErrorDialog(
        missingPhoto
            ? 'Please capture all fitment photos before submitting.'
            : 'Please complete all fields and photos.',
      );
      return;
    }
    setState(() {
      _isVerifying = true;
      _consentGiven = false;
      _error = null;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_verifyScrollController.hasClients) {
        _verifyScrollController.jumpTo(0);
      }
    });
  }

  Future<void> _showErrorDialog(String message) async {
    if (!mounted) return;
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
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('OK'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _extractErrorMessage(dynamic data, {String fallback = 'Failed to generate certificate'}) {
    if (data is Map) {
      final msg = data['message'];
      if (msg is List) {
        return msg.map((e) => e.toString()).where((e) => e.isNotEmpty).join('\n');
      }
      if (msg != null && msg.toString().trim().isNotEmpty) {
        return msg.toString();
      }
    }
    return fallback;
  }

  Future<void> _submit() async {
    if (!_consentGiven) return;
    if (_isRenewal && _renewalCredits < 1 && !_adminTestMode) {
      _showErrorDialog('No renewal credits remaining.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final body = <String, dynamic>{
        'kind': _isRenewal ? 'RENEWAL' : 'NEW',
        'sldOemId': _oemId,
        'modelId': _modelId,
        'approvedVehicleModelId': _approvedVehicleModelId,
        'sealNumber': _sealCtrl.text.trim(),
        'locationText': _locationCtrl.text.trim(),
        'latitude': _lat,
        'longitude': _lng,
        'vehicleDetails': {
          'registrationRto': _regRtoCtrl.text.trim().toUpperCase(),
          'series': _seriesCtrl.text.trim().toUpperCase(),
          'vehicleNumber': _vehicleNumberCtrl.text.trim().toUpperCase(),
          'chassisNumber': _chassisCtrl.text.trim().toUpperCase(),
          'engineNumber': _engineCtrl.text.trim().toUpperCase(),
          'manufacturingYear': _yearCtrl.text.trim(),
          'passingRto': _passingRtoCtrl.text.trim().toUpperCase(),
          'vehicleMake': _vehicleMake,
        },
        'ownerDetails': {
          'ownerName': _ownerNameCtrl.text.trim().toUpperCase(),
          'ownerContact': _ownerPhoneCtrl.text.trim(),
        },
        'photos': {
          'photoPlate': _photos['photoPlate'],
          'photoInstalled': _photos['photoInstalled'],
          'photoSeal': _photos['photoSeal'],
          'photoSerial': _photos['photoSerial'],
        },
      };
      if (_isRenewal) {
        body['serialNumber'] = _serialManualCtrl.text.trim().toUpperCase();
      } else {
        body['deviceSerialId'] = _serialId;
      }

      // Cert create uploads 4 photos + builds PDF; allow longer than default 30s.
      final res = await ApiHolder.api.post(
        '/sld/certificates',
        data: body,
        options: Options(
          sendTimeout: const Duration(seconds: 120),
          receiveTimeout: const Duration(seconds: 120),
        ),
      );

      final raw = res.data;
      final data = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
      final ok = data['success'] == true ||
          (data['certificateNumber']?.toString().isNotEmpty ?? false);
      if (!ok) {
        if (!mounted) return;
        setState(() => _submitting = false);
        await _showErrorDialog(
          _extractErrorMessage(data, fallback: 'Failed to generate certificate'),
        );
        return;
      }

      if (!mounted) return;
      setState(() => _submitting = false);

      String pdfUrl = data['pdfUrl']?.toString() ?? '';
      if (pdfUrl.isNotEmpty && !pdfUrl.startsWith('http')) {
        const apiBase = String.fromEnvironment(
          'API_BASE',
          defaultValue: 'https://smartvahan.net/api',
        );
        final origin = apiBase.replaceAll(RegExp(r'/api/?$'), '');
        pdfUrl = pdfUrl.startsWith('/') ? '$origin$pdfUrl' : '$origin/$pdfUrl';
      }

      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed(
        '/sld/success',
        arguments: {
          'certificateNumber': data['certificateNumber'],
          'pdfUrl': pdfUrl,
          'vehicleNumber': _vehicleNumberCtrl.text.trim().toUpperCase(),
          'oemLabel': _oemLabel,
        },
      );
    } on DioException catch (e) {
      String message = 'Failed to generate certificate';
      if (e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          e.type == DioExceptionType.connectionTimeout) {
        message =
            'Request timed out while generating certificate. Please check History / admin inventory — the certificate may already have been created.';
      } else if (e.response?.data != null) {
        message = _extractErrorMessage(e.response!.data, fallback: e.message ?? message);
      } else if ((e.message ?? '').trim().isNotEmpty) {
        message = e.message!;
      }
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = null;
      });
      await _showErrorDialog(message);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = null;
      });
      await _showErrorDialog(e.toString().isNotEmpty ? e.toString() : 'Failed to generate certificate');
    }
  }

  List<DropdownMenuItem<String>> _rtoItems(List<dynamic> source) {
    final items = <DropdownMenuItem<String>>[];
    final seen = <String>{};
    for (final e in source) {
      String code = '';
      String name = '';
      if (e is Map) {
        code = e['code']?.toString() ?? '';
        name = e['name']?.toString() ?? '';
      } else {
        code = e.toString();
      }
      code = code.trim();
      if (code.isEmpty || !seen.add(code)) continue;
      final label = name.trim().isNotEmpty ? '$code - $name' : code;
      items.add(DropdownMenuItem(value: code, child: Text(label)));
    }
    return items;
  }

  void _goHome() {
    Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        if (_isVerifying) {
          setState(() => _isVerifying = false);
          return false;
        }
        _goHome();
        return false;
      },
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFF12314D),
          foregroundColor: Colors.white,
          title: Text(
            _isVerifying
                ? 'Verify Details'
                : (_isRenewal ? 'SLD Renewal' : 'New SLD Fitment'),
          ),
          leading: IconButton(
            icon: const Icon(LucideIcons.arrow_left),
            onPressed: () {
              if (_isVerifying) {
                setState(() => _isVerifying = false);
                return;
              }
              _goHome();
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
            child: _loadingMeta
                ? const Center(child: CircularProgressIndicator())
                : _error != null && _oems.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(_error!, textAlign: TextAlign.center),
                              const SizedBox(height: 12),
                              ElevatedButton(onPressed: _init, child: const Text('Retry')),
                            ],
                          ),
                        ),
                      )
                    : _isVerifying
                        ? _buildVerificationView()
                        : _buildFormView(),
          ),
        ),
      ),
    );
  }

  Widget _buildFormView() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
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
            if (_isRenewal)
              Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF7E6),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE6C56A)),
                ),
                child: Text(
                  _adminTestMode
                      ? 'RENEWAL — Admin test mode (no credit debit).'
                      : 'RENEWAL — 1 credit will be used. Credits left: $_renewalCredits',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF7A5B00),
                    fontSize: 13,
                  ),
                ),
              ),
            const Divider(thickness: 1, color: Colors.grey),
            _buildGradientFormCard(
              title: 'SLD Details',
              subtitle: 'एस.एल.डी. विवरण',
              children: [
                _buildFormDropdown<String>(
                  value: _oemId,
                  items: _oems
                      .whereType<Map>()
                      .map(
                        (o) => DropdownMenuItem(
                          value: o['id']?.toString(),
                          child: Text('${o['name']} (${o['code']})'),
                        ),
                      )
                      .toList(),
                  label: 'SLD Company / एस.एल.डी. कंपनी',
                  onChanged: (val) {
                    setState(() {
                      _oemId = val;
                      _modelId = null;
                      _serialId = null;
                      _serialManualCtrl.clear();
                      _serials = [];
                      _approvedVehicles = [];
                      _vehicleMake = null;
                      _approvedVehicleModelId = null;
                    });
                  },
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                ),
                _buildFormDropdown<String>(
                  value: _modelId,
                  items: _models
                      .whereType<Map>()
                      .map(
                        (m) => DropdownMenuItem(
                          value: m['id']?.toString(),
                          child: Text('${m['name']} (${m['code']})'),
                        ),
                      )
                      .toList(),
                  label: 'SLD Model / एस.एल.डी. मॉडल',
                  onChanged: (val) async {
                    setState(() {
                      _modelId = val;
                      _serialId = null;
                      _serialManualCtrl.clear();
                      _vehicleMake = null;
                      _approvedVehicleModelId = null;
                    });
                    if (_isRenewal) {
                      await _loadVehicleModels();
                    } else {
                      await Future.wait([_loadSerials(), _loadVehicleModels()]);
                    }
                  },
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                ),
                if (_isRenewal) ...[
                  _buildFormInput(
                    controller: _serialManualCtrl,
                    label: 'SLD Serial / एस.एल.डी. सीरियल',
                    validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9\-]')),
                      _upperCaseFormatter,
                    ],
                    onEditingComplete: _tryPrefillPriorCert,
                  ),
                  if (_prefillNote != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        _prefillNote!,
                        style: TextStyle(
                          fontSize: 12,
                          color: _prefillNote!.startsWith('Prefill')
                              ? const Color(0xFF166534)
                              : const Color(0xFF6B7280),
                        ),
                      ),
                    ),
                ] else ...[
                  _buildFormDropdown<String>(
                    value: _serialId,
                    items: _serials
                        .whereType<Map>()
                        .map(
                          (s) {
                            final sn = s['serialNumber']?.toString() ?? '';
                            final st = s['status']?.toString();
                            final label = (st != null && st.isNotEmpty && st != 'ASSIGNED')
                                ? '$sn ($st)'
                                : sn;
                            return DropdownMenuItem(
                              value: s['id']?.toString(),
                              child: Text(label),
                            );
                          },
                        )
                        .toList(),
                    label: _adminTestMode
                        ? 'SLD Serial (AVAILABLE / ASSIGNED)'
                        : 'SLD Serial / एस.एल.डी. सीरियल',
                    onChanged: (val) => setState(() => _serialId = val),
                    validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                  ),
                  if (_modelId != null && _serials.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 12),
                      child: Text(
                        'No assigned serials for this model. Contact admin.',
                        style: TextStyle(
                          color: Colors.red,
                          fontWeight: FontWeight.w700,
                          fontSize: 12.5,
                        ),
                      ),
                    ),
                ],
                _buildFormInput(
                  controller: _sealCtrl,
                  label: 'Seal Number / सील नंबर',
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9\-]')),
                    _upperCaseFormatter,
                  ],
                ),
              ],
            ),
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
                  value: _vehicleMake,
                  items: _makes.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                  label: 'Vehicle Make / वाहन निर्माता',
                  onChanged: (val) {
                    setState(() {
                      _vehicleMake = val;
                      _approvedVehicleModelId = null;
                    });
                  },
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                ),
                _buildFormDropdown<String>(
                  value: _approvedVehicleModelId,
                  items: _modelsForMake
                      .map(
                        (m) {
                          final name = m['modelName']?.toString() ?? '';
                          final speed = m['setSpeedKmph'];
                          final label = speed == null ? name : '$name ($speed km/h)';
                          return DropdownMenuItem(
                            value: m['id']?.toString(),
                            child: Text(label, overflow: TextOverflow.ellipsis),
                          );
                        },
                      )
                      .toList(),
                  label: 'Vehicle Model / वाहन मॉडल',
                  onChanged: (val) => setState(() => _approvedVehicleModelId = val),
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                ),
                _buildFormDropdown<String>(
                  value: _yearCtrl.text.isNotEmpty ? _yearCtrl.text : null,
                  items: _years.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                  label: 'Manufacturing Year / निर्माण वर्ष',
                  onChanged: (val) {
                    if (val != null) _yearCtrl.text = val;
                    setState(() {});
                  },
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                ),
                _buildFormDropdown<String>(
                  value: _passingRtoCtrl.text.isNotEmpty ? _passingRtoCtrl.text : null,
                  items: _rtoItems(_passingRtos),
                  label: 'Passing RTO / पासिंग आर.टी.ओ.',
                  onChanged: (val) {
                    if (val != null) _passingRtoCtrl.text = val;
                    setState(() {});
                  },
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                ),
                if (!_loadingLookups && _passingRtos.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: Text(
                      'No Passing RTO authorized for this dealer.',
                      style: TextStyle(
                        color: Colors.red,
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                      ),
                    ),
                  ),
                _buildFormDropdown<String>(
                  value: _regRtoCtrl.text.isNotEmpty ? _regRtoCtrl.text : null,
                  items: _rtoItems(_rtos),
                  label: 'Registration RTO / पंजीकरण आर.टी.ओ.',
                  onChanged: (val) {
                    if (val != null) {
                      _regRtoCtrl.text = val;
                      _updateVehicleNumber();
                    }
                    setState(() {});
                  },
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                ),
                _buildFormInput(
                  controller: _seriesCtrl,
                  label: 'Registration Series / पंजीकरण शृंखला',
                  note:
                      'Only Enter Value After Registration RTO / केवल RTO के बाद की श्रृंखला दर्ज करें',
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]')),
                    _upperCaseFormatter,
                  ],
                  maxLength: 10,
                  onChanged: (_) {
                    _updateVehicleNumber();
                    setState(() {});
                  },
                ),
                _buildFormInput(
                  controller: _vehicleNumberCtrl,
                  label: 'Vehicle Number (Auto-generated)',
                  readOnly: true,
                  fillColor: const Color(0xFF91A8BD),
                  textColor: Colors.white,
                  labelColor: Colors.white,
                ),
                _buildFormInput(
                  controller: _chassisCtrl,
                  label: 'Chassis No / चेसिस नंबर',
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Required';
                    if (v.length != 5) return 'Must be 5 characters';
                    return null;
                  },
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]')),
                    _upperCaseFormatter,
                  ],
                  maxLength: 5,
                ),
                _buildFormInput(
                  controller: _engineCtrl,
                  label: 'Engine No / इंजन नंबर',
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Required';
                    if (v.length != 5) return 'Must be 5 characters';
                    return null;
                  },
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]')),
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
                  controller: _ownerNameCtrl,
                  label: 'Owner Name / मालिक का नाम',
                  validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z\s]')),
                    _upperCaseFormatter,
                  ],
                ),
                _buildFormInput(
                  controller: _ownerPhoneCtrl,
                  label: 'Owner Contact / मालिक का संपर्क',
                  keyboardType: TextInputType.phone,
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Required';
                    if (v.length != 10) return 'Must be 10 digits';
                    return null;
                  },
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  maxLength: 10,
                ),
                _buildFormInput(
                  controller: _locationCtrl,
                  label: 'Location / स्थान',
                  readOnly: true,
                  validator: (v) => v == null || v.isEmpty ? 'Location required' : null,
                ),
                if (_locationError != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(_locationError!, style: const TextStyle(color: Colors.red)),
                  ),
              ],
            ),
            const Divider(thickness: 1, color: Colors.grey),
            _buildGradientFormCard(
              title: 'Fitment Photos',
              subtitle: 'फिटमेंट की तस्वीरें',
              children: [
                _buildPhotoRow('Number Plate / नंबर प्लेट', 'photoPlate'),
                _buildPhotoRow('Device Fitment / डिवाइस फिटमेंट', 'photoInstalled'),
                _buildPhotoRow('Seal Photograph / सील फोटो', 'photoSeal'),
                _buildPhotoRow('Document (RC/Form 20-28-29) / दस्तावेज़', 'photoSerial'),
              ],
            ),
            if (_error != null && _oems.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
              ),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _isFormFilled && !_submitting ? _goToVerify : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFF13546),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 4,
                  disabledBackgroundColor: Colors.grey[400],
                ),
                icon: const Icon(LucideIcons.shield_check, color: Colors.white),
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
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildVerificationView() {
    return SingleChildScrollView(
      controller: _verifyScrollController,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildSectionTitle('Verify Details', 'विवरण सत्यापित करें'),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            childAspectRatio: 2.5,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            children: [
              _buildDetailCard('SLD Company', _oemLabel),
              _buildDetailCard('SLD Model', _modelLabel),
              _buildDetailCard('SLD Serial', _serialLabel),
              _buildDetailCard('Seal No', _sealCtrl.text),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(thickness: 1, color: Colors.grey),
          _buildGlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildSectionTitle('Vehicle Details', 'वाहन की सूची'),
                _buildDisabledInput('Vehicle Make', _vehicleMake ?? '-'),
                const SizedBox(height: 8),
                _buildDisabledInput('Vehicle Model', _vehicleModelLabel),
                const SizedBox(height: 8),
                _buildDisabledInput('Passing RTO', _passingRtoCtrl.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Registration RTO', _regRtoCtrl.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Series', _seriesCtrl.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Vehicle Number', _vehicleNumberCtrl.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Manufacturing Year', _yearCtrl.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Chassis No', _chassisCtrl.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Engine No', _engineCtrl.text),
                const SizedBox(height: 12),
                const Divider(thickness: 1, color: Colors.grey),
                _buildSectionTitle('Owner Details', 'वाहन मालिक का विवरण'),
                _buildDisabledInput('Owner Name', _ownerNameCtrl.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Owner Contact', _ownerPhoneCtrl.text),
                const SizedBox(height: 8),
                _buildDisabledInput('Location', _locationCtrl.text),
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
                    _buildVerificationPhoto('Number Plate', 'photoPlate'),
                    _buildVerificationPhoto('Device Fitment', 'photoInstalled'),
                    _buildVerificationPhoto('Seal Photograph', 'photoSeal'),
                    _buildVerificationPhoto('Document', 'photoSerial'),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _consentGiven ? const Color(0xFF12314D) : Colors.grey.shade300,
              ),
            ),
            child: CheckboxListTile(
              value: _consentGiven,
              onChanged: (val) => setState(() => _consentGiven = val ?? false),
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
                  onPressed: () => setState(() => _isVerifying = false),
                  icon: const Icon(LucideIcons.pencil, color: Colors.white),
                  label: const Text(
                    'Edit Details',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF12314D),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _consentGiven && !_submitting ? _submit : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFF13546),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 4,
                    disabledBackgroundColor: Colors.grey[400],
                  ),
                  icon: _submitting
                      ? const SizedBox.shrink()
                      : const Icon(LucideIcons.shield_check, color: Colors.white),
                  label: _submitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
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

  Widget _buildSectionTitle(String title, String subtitle) {
    return Column(
      children: [
        const SizedBox(height: 24),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF12314D)),
        ),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Color(0xFF12314D)),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildGlassContainer({required Widget child}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      decoration: BoxDecoration(
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 16, offset: const Offset(0, 4)),
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
              border: Border.all(color: Colors.white.withOpacity(0.6), width: 1.5),
            ),
            child: child,
          ),
        ),
      ),
    );
  }

  Widget _buildDisabledInput(String label, String value) {
    return Container(
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
          Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(color: Color(0xFF12314D), fontSize: 14, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailCard(String label, String value) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF162F45), Color(0xFF00417B)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w500)),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
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
                : const Icon(LucideIcons.image, color: Colors.grey, size: 40),
          ),
        ),
        const SizedBox(height: 8),
        Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
      ],
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
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500),
                    textAlign: TextAlign.center,
                  ),
                ],
              ],
            ),
          ),
          Padding(padding: const EdgeInsets.all(16), child: Column(children: children)),
        ],
      ),
    );
  }

  Widget _buildFormInput({
    required TextEditingController controller,
    required String label,
    String? Function(String?)? validator,
    TextInputType keyboardType = TextInputType.text,
    bool readOnly = false,
    String? note,
    int? maxLength,
    List<TextInputFormatter>? inputFormatters,
    ValueChanged<String>? onChanged,
    VoidCallback? onEditingComplete,
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
            maxLength: maxLength,
            inputFormatters: inputFormatters,
            onChanged: onChanged,
            onEditingComplete: onEditingComplete,
            textInputAction:
                onEditingComplete != null ? TextInputAction.done : TextInputAction.next,
            style: TextStyle(fontSize: 14, color: textColor ?? const Color(0xFF12314D)),
            decoration: InputDecoration(
              labelText: label,
              labelStyle: TextStyle(color: labelColor ?? Colors.grey[600], fontSize: 14),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              counterText: '',
            ),
          ),
        ),
        if (note != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              note,
              style: const TextStyle(color: Colors.red, fontSize: 11, fontWeight: FontWeight.bold),
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
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
            icon: const Icon(LucideIcons.chevron_down, color: Color(0xFF12314D)),
            dropdownColor: Colors.white,
          ),
        ),
        const SizedBox(height: 16),
      ],
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
                  onPressed: () => _capture(key),
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
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
}

class SldSuccessScreen extends StatefulWidget {
  const SldSuccessScreen({super.key});

  @override
  State<SldSuccessScreen> createState() => _SldSuccessScreenState();
}

class _SldSuccessScreenState extends State<SldSuccessScreen> {
  String _message = 'Certificate generated successfully';
  String? _pdfUrl;
  String? _certNo;
  String? _vehicleNo;
  String? _oemLabel;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args = (ModalRoute.of(context)?.settings.arguments as Map?) ?? {};
    _certNo = args['certificateNumber']?.toString();
    _vehicleNo = args['vehicleNumber']?.toString();
    _pdfUrl = args['pdfUrl']?.toString();
    _oemLabel = args['oemLabel']?.toString();
    final msg = args['message']?.toString();
    if (msg != null && msg.isNotEmpty) _message = msg;
  }

  void _goHome() {
    Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
  }

  Future<void> _openPdf() async {
    if (_pdfUrl == null || _pdfUrl!.isEmpty) return;
    try {
      await openPdfFromUrl(_pdfUrl!, filenameHint: _certNo ?? 'sld_certificate');
    } catch (_) {}
  }

  Future<void> _shareCertificate() async {
    if (_pdfUrl == null || _pdfUrl!.isEmpty) return;
    final buffer = StringBuffer('SMARTVAHAN SLD Fitment Certificate\n');
    if (_oemLabel != null && _oemLabel!.isNotEmpty) buffer.writeln('SLD OEM: $_oemLabel');
    if (_certNo != null && _certNo!.isNotEmpty) buffer.writeln('Certificate: $_certNo');
    if (_vehicleNo != null && _vehicleNo!.isNotEmpty) buffer.writeln('Vehicle: $_vehicleNo');
    buffer.writeln('Certificate PDF: $_pdfUrl');
    await Share.share(buffer.toString());
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
                    const Icon(LucideIcons.circle_check, color: Colors.green, size: 96),
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
                        style: const TextStyle(color: Colors.grey, fontSize: 14),
                      ),
                    if (_vehicleNo != null && _vehicleNo!.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        _vehicleNo!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFF12314D),
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    if (_certNo != null && _certNo!.isNotEmpty)
                      Text(
                        _certNo!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                      ),
                    const SizedBox(height: 32),
                    ElevatedButton.icon(
                      onPressed: _pdfUrl == null || _pdfUrl!.isEmpty ? null : _openPdf,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFF13546),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: const Icon(LucideIcons.download, color: Colors.white),
                      label: const Text('Download', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: _pdfUrl == null || _pdfUrl!.isEmpty ? null : _shareCertificate,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF12314D),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: const Icon(LucideIcons.share, color: Colors.white),
                      label: const Text('Share', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).pushNamedAndRemoveUntil('/sld', (r) => false),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFF13546),
                        side: const BorderSide(color: Color(0xFFF13546), width: 2),
                        backgroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: const Icon(LucideIcons.gauge, color: Color(0xFFF13546)),
                      label: const Text('New SLD Fitment', style: TextStyle(fontWeight: FontWeight.bold)),
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

class _SldHistoryItem {
  final String id;
  final DateTime generatedAt;
  final String certificateNumber;
  final String kind;
  final String vehicleNumber;
  final String ownerName;
  final String oem;
  final String deviceType;
  final String serialNumber;
  final String sealNumber;
  final String? smartvahanPdfUrl;
  final String? vahanPdfUrl;

  _SldHistoryItem({
    required this.id,
    required this.generatedAt,
    required this.certificateNumber,
    required this.kind,
    required this.vehicleNumber,
    required this.ownerName,
    required this.oem,
    required this.deviceType,
    required this.serialNumber,
    required this.sealNumber,
    required this.smartvahanPdfUrl,
    required this.vahanPdfUrl,
  });

  bool get isRenewal => kind.toUpperCase() == 'RENEWAL';
}

class SldHistoryScreen extends StatefulWidget {
  const SldHistoryScreen({super.key});

  @override
  State<SldHistoryScreen> createState() => _SldHistoryScreenState();
}

class _SldHistoryScreenState extends State<SldHistoryScreen> {
  DateTime? _fromDate;
  DateTime? _toDate;
  final TextEditingController _searchController = TextEditingController();
  bool _loading = false;
  bool _hasLoadedOnce = false;
  String? _error;
  List<_SldHistoryItem> _items = [];
  List<_SldHistoryItem> _filteredItems = [];

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
    final picked = await showDatePicker(
      context: context,
      initialDate: _fromDate ?? DateTime.now(),
      firstDate: DateTime(2023, 1, 1),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _fromDate = picked);
  }

  Future<void> _pickToDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _toDate ?? _fromDate ?? DateTime.now(),
      firstDate: DateTime(2023, 1, 1),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _toDate = picked);
  }

  List<_SldHistoryItem> _filterItems(List<_SldHistoryItem> source) {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) return List<_SldHistoryItem>.from(source);
    return source
        .where(
          (e) =>
              e.vehicleNumber.toLowerCase().contains(query) ||
              e.certificateNumber.toLowerCase().contains(query) ||
              e.ownerName.toLowerCase().contains(query) ||
              e.oem.toLowerCase().contains(query) ||
              e.deviceType.toLowerCase().contains(query) ||
              e.serialNumber.toLowerCase().contains(query) ||
              e.sealNumber.toLowerCase().contains(query),
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
      if (_fromDate != null) params['from'] = _formatParamDate(_fromDate!);
      if (_toDate != null) params['to'] = _formatParamDate(_toDate!);
      final res = await ApiHolder.api.get('/sld/dealer/certificates', queryParameters: params);
      final raw = res.data;
      final list = raw is List ? raw : <dynamic>[];
      final items = list.map((e) {
        final row = e as Map;
        final dateStr = row['generatedAt']?.toString();
        DateTime date;
        try {
          date = dateStr != null ? DateTime.parse(dateStr) : DateTime.now();
        } catch (_) {
          date = DateTime.now();
        }
        final oemMap = row['oem'];
        String oem = '';
        if (oemMap is Map) {
          oem = oemMap['name']?.toString() ?? oemMap['code']?.toString() ?? '';
        }
        final modelMap = row['model'];
        String deviceType = row['deviceType']?.toString().trim() ?? '';
        if (deviceType.isEmpty && modelMap is Map) {
          deviceType = modelMap['sldType']?.toString().trim() ??
              modelMap['deviceType']?.toString().trim() ??
              '';
        }
        if (deviceType.isEmpty) deviceType = '—';
        return _SldHistoryItem(
          id: row['id']?.toString() ?? '',
          generatedAt: date,
          certificateNumber: row['certificateNumber']?.toString() ?? '',
          kind: row['kind']?.toString().toUpperCase() ?? 'NEW',
          vehicleNumber: row['vehicleNumber']?.toString() ?? '',
          ownerName: row['ownerName']?.toString() ?? '—',
          oem: oem.isEmpty ? '—' : oem,
          deviceType: deviceType,
          serialNumber: row['serialNumber']?.toString() ?? '—',
          sealNumber: row['sealNumber']?.toString() ?? '—',
          smartvahanPdfUrl: ApiHolder.resolveAssetUrl(
            row['pdfUrl']?.toString() ?? row['smartvahanPdfPath']?.toString(),
          ),
          vahanPdfUrl: ApiHolder.resolveAssetUrl(row['vahanPdfPath']?.toString()),
        );
      }).toList();
      if (!mounted) return;
      setState(() {
        _items = items;
        _filteredItems = _filterItems(items);
        _loading = false;
      });
    } on DioException catch (e) {
      String message = 'Failed to load SLD history';
      final resp = e.response;
      if (resp != null && resp.data is Map && resp.data['message'] != null) {
        message = resp.data['message'].toString();
      }
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Network error while loading history';
      });
    }
  }

  Future<void> _openPdf(String? url, String hint) async {
    if (url == null || url.isEmpty) return;
    try {
      await openPdfFromUrl(url, filenameHint: hint);
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
              const Icon(LucideIcons.calendar, color: Color(0xFF12314D), size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
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
    return WillPopScope(
      onWillPop: () async {
        Navigator.of(context).pushNamedAndRemoveUntil('/home', (r) => false);
        return false;
      },
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFF12314D),
          foregroundColor: Colors.white,
          title: const Text('My SLD Fitments'),
        ),
        bottomNavigationBar: const DealerBottomNav(currentRoute: '/sld/history'),
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
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Apply Filter', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      labelText: 'Search',
                      prefixIcon: const Icon(LucideIcons.search, color: Color(0xFF12314D)),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12), textAlign: TextAlign.center),
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
                            ? 'No SLD certificates found.'
                            : 'Select a date range and click Apply Filter.',
                        style: const TextStyle(fontSize: 14, color: Colors.grey),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _filteredItems.length,
                      itemBuilder: (context, index) {
                        final item = _filteredItems[index];
                        final hasVahan = item.vahanPdfUrl != null && item.vahanPdfUrl!.isNotEmpty;
                        return Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.1),
                                blurRadius: 10,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Column(
                            children: [
                              Align(
                                alignment: Alignment.centerLeft,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: item.isRenewal
                                        ? const Color(0xFFEEE8FF)
                                        : const Color(0xFFE8F4FC),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    item.isRenewal ? 'RENEWAL' : 'NEW',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                      color: item.isRenewal
                                          ? const Color(0xFF5B21B6)
                                          : const Color(0xFF075985),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: _buildInfoColumn(
                                      'Vehicle Number',
                                      item.vehicleNumber.isEmpty ? '—' : item.vehicleNumber,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _buildInfoColumn(
                                      'Date',
                                      _formatDisplayDate(item.generatedAt),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: _buildInfoColumn(
                                      'Owner Name',
                                      item.ownerName.isEmpty ? '—' : item.ownerName,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _buildInfoColumn(
                                      'SLD Certificate No.',
                                      item.certificateNumber.isEmpty
                                          ? '—'
                                          : item.certificateNumber,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(child: _buildInfoColumn('OEM', item.oem)),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _buildInfoColumn('Device Type', item.deviceType),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: _buildInfoColumn('SLD Serial', item.serialNumber),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _buildInfoColumn('Seal Number', item.sealNumber),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: ElevatedButton.icon(
                                      onPressed: item.smartvahanPdfUrl == null || item.smartvahanPdfUrl!.isEmpty
                                          ? null
                                          : () => _openPdf(item.smartvahanPdfUrl, item.certificateNumber),
                                      icon: const Icon(LucideIcons.file_text, size: 18),
                                      label: const Text('View Cert'),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: const Color(0xFF12314D),
                                        foregroundColor: Colors.white,
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: hasVahan
                                          ? () => _openPdf(item.vahanPdfUrl, '${item.certificateNumber}_vahan')
                                          : null,
                                      icon: const Icon(LucideIcons.file_check, size: 18),
                                      label: const Text('Vahan Cert'),
                                      style: OutlinedButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
