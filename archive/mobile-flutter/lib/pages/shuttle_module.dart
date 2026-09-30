import 'package:flutter/material.dart';

import '../screens/driver_screen.dart';
import '../screens/rider_screen.dart';

/// Josh shell tab — hosts Seb's existing Rider / Driver shuttle MVP.
class ShuttleModule extends StatefulWidget {
  const ShuttleModule({super.key});

  @override
  State<ShuttleModule> createState() => _ShuttleModuleState();
}

class _ShuttleModuleState extends State<ShuttleModule> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Row(
            children: [
              _TabChip(
                label: 'Rider',
                selected: _index == 0,
                onTap: () => setState(() => _index = 0),
              ),
              const SizedBox(width: 8),
              _TabChip(
                label: 'Driver',
                selected: _index == 1,
                onTap: () => setState(() => _index = 1),
              ),
            ],
          ),
        ),
        Expanded(
          child: IndexedStack(
            index: _index,
            children: const [
              RiderScreen(),
              DriverScreen(),
            ],
          ),
        ),
      ],
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: selected ? const Color(0xFFCFE8DC) : const Color(0xFFEEEEEE),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ),
    );
  }
}
