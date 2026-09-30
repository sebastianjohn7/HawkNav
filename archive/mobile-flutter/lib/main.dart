import 'package:arcgis_maps/arcgis_maps.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'pages/landing_page.dart';
import 'pages/nav_module.dart';
import 'pages/settings_page.dart';
import 'pages/sign_in_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Prefer local .env; fall back to committed placeholders for first boot.
  await dotenv.load(fileName: '.env', isOptional: true);
  if (dotenv.env.isEmpty) {
    await dotenv.load(fileName: '.env.example', isOptional: true);
  }

  if (hasArcgisApiKey) {
    ArcGISEnvironment.apiKey = arcgisApiKey;
  }

  if (hasSupabaseConfig) {
    await Supabase.initialize(
      url: supabaseUrl,
      publishableKey: supabaseAnonKey,
    );
  }

  runApp(const HawkNavApp());
}

class HawkNavApp extends StatelessWidget {
  const HawkNavApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Hawk Nav',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B6E4F)),
        useMaterial3: true,
      ),
      home: const LandingPage(),
      routes: {
        '/landing_page': (context) => const LandingPage(),
        '/sign_in_page': (context) => const SignInPage(),
        '/nav_module': (context) => const NavModule(),
        '/settings_page': (context) => const SettingsPage(),
      },
    );
  }
}
