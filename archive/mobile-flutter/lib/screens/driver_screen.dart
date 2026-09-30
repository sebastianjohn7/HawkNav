import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../config.dart';

class DriverScreen extends StatefulWidget {
  const DriverScreen({super.key});

  @override
  State<DriverScreen> createState() => _DriverScreenState();
}

class _DriverScreenState extends State<DriverScreen> {
  bool _onShift = false;
  bool _streaming = false;
  bool _busy = false;
  String _status = 'Idle — tap Go live when your shift starts';
  Position? _last;
  /// Last position successfully written to Supabase (for movement gating).
  Position? _lastWritten;
  DateTime? _lastWriteAt;
  int _skippedWrites = 0;
  StreamSubscription<Position>? _sub;

  /// Ignore GPS jitter under this distance (meters).
  static const _minMoveMeters = 10.0;

  /// Even when parked, refresh updated_at so riders know the feed is alive.
  static const _heartbeat = Duration(seconds: 45);

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    super.dispose();
  }

  LocationSettings _locationSettings() {
    // OS-level filter (~8m) cuts noisy callbacks; we also gate DB writes at 10m.
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 8,
        intervalDuration: const Duration(seconds: 4),
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: 8,
        pauseLocationUpdatesAutomatically: false,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 8,
    );
  }

  Future<bool> _ensureLocationReady() async {
    final client = supabase;
    if (client == null) {
      setState(() => _status = 'Missing Supabase keys — see README Phase 1B');
      return false;
    }

    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      setState(() => _status = 'Location services disabled');
      return false;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      setState(() => _status = 'Location permission denied');
      return false;
    }
    return true;
  }

  bool _shouldWrite(Position pos, {required bool force}) {
    if (force || _lastWritten == null || _lastWriteAt == null) return true;

    final moved = Geolocator.distanceBetween(
      _lastWritten!.latitude,
      _lastWritten!.longitude,
      pos.latitude,
      pos.longitude,
    );
    if (moved >= _minMoveMeters) return true;

    // Heartbeat: keep updated_at fresh while sitting still.
    if (DateTime.now().difference(_lastWriteAt!) >= _heartbeat) return true;
    return false;
  }

  Future<bool> _upsertPosition(Position pos, {bool force = false}) async {
    final client = supabase;
    if (client == null) return false;

    if (!_shouldWrite(pos, force: force)) {
      _skippedWrites++;
      return false;
    }

    final heading = pos.heading >= 0 ? pos.heading : null;
    await client.from('shuttle_positions').upsert(
      {
        'shuttle_id': defaultShuttleId,
        'lat': pos.latitude,
        'lng': pos.longitude,
        'heading': heading,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      onConflict: 'shuttle_id',
    );
    _lastWritten = pos;
    _lastWriteAt = DateTime.now();
    return true;
  }

  /// First fix for Go live — times out instead of spinning forever (common on Simulator).
  Future<Position> _firstFix() async {
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 12),
        ),
      );
    } on TimeoutException {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null) return last;
      throw TimeoutException(
        'No GPS fix — on Simulator use Features → Location → Custom Location',
      );
    }
  }

  /// Pin once + start the GPS stream. One action for the whole shift.
  Future<void> _goLive() async {
    if (_busy || _streaming) return;
    setState(() {
      _busy = true;
      _status = 'Getting location…';
    });

    try {
      if (!await _ensureLocationReady()) return;

      final pos = await _firstFix();
      if (!mounted) return;
      setState(() => _status = 'Publishing pin…');

      await _upsertPosition(pos, force: true);
      if (!mounted) return;

      await _sub?.cancel();
      _sub = Geolocator.getPositionStream(
        locationSettings: _locationSettings(),
      ).listen((next) async {
        try {
          if (!mounted) return;
          setState(() => _last = next);
          final wrote = await _upsertPosition(next);
          if (!mounted) return;
          setState(() {
            _status = wrote
                ? 'Live — wrote pin (moved ≥${_minMoveMeters.toInt()}m)'
                : 'Live — stationary, skipped DB write ($_skippedWrites)';
          });
        } catch (e) {
          if (mounted) setState(() => _status = 'Upsert error: $e');
        }
      }, onError: (Object e) {
        if (mounted) setState(() => _status = 'Stream error: $e');
      });

      setState(() {
        _last = pos;
        _onShift = true;
        _streaming = true;
        _skippedWrites = 0;
        _status = 'Live — writes on ≥${_minMoveMeters.toInt()}m move '
            '(heartbeat ${_heartbeat.inSeconds}s)';
      });
    } catch (e) {
      if (mounted) setState(() => _status = 'Go live error: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _stop() async {
    await _sub?.cancel();
    _sub = null;
    setState(() {
      _streaming = false;
      _status = _onShift
          ? 'Stopped — pin still visible until check out'
          : 'Stopped';
    });
  }

  Future<void> _checkOut() async {
    await _stop();
    setState(() {
      _onShift = false;
      _last = null;
      _lastWritten = null;
      _lastWriteAt = null;
      _skippedWrites = 0;
      _status = 'Checked out';
    });
  }

  @override
  Widget build(BuildContext context) {
    final last = _last;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Driver',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          if (!hasSupabaseConfig)
            Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.all(10),
              color: const Color(0xFFFFF4E5),
              child: const Text(
                'Set SUPABASE_URL and SUPABASE_ANON_KEY after creating a Supabase project (README Phase 1B).',
                style: TextStyle(color: Color(0xFF8A4B08)),
              ),
            ),
          const SizedBox(height: 12),
          Text('Status: $_status', style: const TextStyle(fontSize: 14)),
          if (last != null) ...[
            const SizedBox(height: 8),
            Text(
              'Pinned: ${last.latitude.toStringAsFixed(5)}, '
              '${last.longitude.toStringAsFixed(5)} '
              'heading=${last.heading >= 0 ? last.heading.toStringAsFixed(0) : '—'}',
              style: const TextStyle(fontSize: 14),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor:
                  _streaming ? const Color(0xFF8B1E1E) : const Color(0xFF0B6E4F),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            onPressed: _busy
                ? null
                : (_streaming ? _stop : _goLive),
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Icon(_streaming ? Icons.stop : Icons.play_arrow),
            label: Text(_streaming ? 'Stop' : 'Go live'),
          ),
          if (_onShift) ...[
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: _busy ? null : _checkOut,
              child: const Text('Check out'),
            ),
          ],
        ],
      ),
    );
  }
}
