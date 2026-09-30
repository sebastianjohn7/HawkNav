import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hawknav_mobile/pages/landing_page.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Landing shows Get Started', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: LandingPage()));
    await tester.pump();
    expect(find.text('Get Started'), findsOneWidget);
  });
}
