import 'package:flutter/material.dart';

import '../dimensions.dart';

class LandingPage extends StatelessWidget {
  const LandingPage({super.key});

  @override
  Widget build(BuildContext context) {
    final screen = Dimensions(context);

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Center(
            child: Column(
              children: [
                SizedBox(height: screen.screenHeight / 5),
                Image.asset(
                  'assets/img/hawknav_logo.jpg',
                  height: screen.screenWidth * 0.90,
                  width: screen.screenWidth * 0.90,
                  color: Colors.white,
                  colorBlendMode: BlendMode.multiply,
                  errorBuilder: (context, error, stackTrace) => SizedBox(
                    height: screen.screenWidth * 0.40,
                    child: const Center(
                      child: Text(
                        'Hawk Nav',
                        style: TextStyle(fontSize: 32, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Hawk Nav',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
                ),
                SizedBox(height: screen.screenHeight / 20),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    backgroundColor: Colors.blue[100],
                    fixedSize: Size(screen.screenWidth * 0.85, 60),
                  ),
                  onPressed: () {
                    Navigator.pushNamed(context, '/sign_in_page');
                  },
                  child: const Text('Get Started'),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
