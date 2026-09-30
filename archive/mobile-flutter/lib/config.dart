import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const defaultShuttleId = 'shuttle-1';

String _env(String key, [String fallback = '']) {
  final fromDefine = String.fromEnvironment(key);
  if (fromDefine.isNotEmpty) return fromDefine;
  try {
    final fromDot = dotenv.maybeGet(key);
    if (fromDot != null && fromDot.isNotEmpty) return fromDot;
  } catch (_) {
    // DotEnv not loaded yet (e.g. widget tests) — fall through.
  }
  return fallback;
}

String get supabaseUrl => _env('SUPABASE_URL');
String get supabaseAnonKey => _env('SUPABASE_ANON_KEY');
String get arcgisApiKey => _env('ARCGIS_API_KEY');

String get apiUrl {
  final raw = _env('API_URL', 'http://localhost:8787');
  return raw.endsWith('/') ? raw.substring(0, raw.length - 1) : raw;
}

bool get hasSupabaseConfig {
  final url = supabaseUrl;
  final anon = supabaseAnonKey;
  return url.isNotEmpty &&
      anon.isNotEmpty &&
      !url.contains('YOUR_PROJECT') &&
      anon != 'your-anon-key';
}

bool get hasArcgisApiKey {
  final key = arcgisApiKey;
  return key.isNotEmpty &&
      key != 'your-arcgis-api-key' &&
      !key.contains('YOUR_');
}

SupabaseClient? get supabase =>
    hasSupabaseConfig ? Supabase.instance.client : null;
