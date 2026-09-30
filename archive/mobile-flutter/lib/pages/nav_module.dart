import 'package:flutter/material.dart';

import 'alerts_module.dart';
import 'indoor_nav.dart';
import 'shuttle_module.dart';

class NavModule extends StatefulWidget {
  const NavModule({super.key});

  @override
  State<NavModule> createState() => _NavModuleState();
}

class _NavModuleState extends State<NavModule> {
  final List<Widget> _pages = const [
    ShuttleModule(),
    IndoorNavModule(),
    AlertsModule(),
  ];

  int _featureIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Hawk Nav'),
        actions: [
          IconButton(
            onPressed: () {
              Navigator.pushNamed(context, '/settings_page');
            },
            icon: const Icon(Icons.settings),
          ),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        currentIndex: _featureIndex,
        onTap: (value) {
          setState(() => _featureIndex = value);
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.directions_bus),
            label: 'Shuttle',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.room),
            label: 'Find',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.notification_important),
            label: 'News & Alerts',
          ),
        ],
      ),
      body: IndexedStack(
        index: _featureIndex,
        children: _pages,
      ),
    );
  }
}
