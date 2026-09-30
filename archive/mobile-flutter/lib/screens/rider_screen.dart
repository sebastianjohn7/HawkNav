import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import '../widgets/campus_map_view.dart';

class RiderScreen extends StatefulWidget {
  const RiderScreen({super.key});

  @override
  State<RiderScreen> createState() => _RiderScreenState();
}

class _RiderScreenState extends State<RiderScreen> {
  String _rtStatus = 'Not connected';
  Map<String, dynamic>? _position;
  List<Map<String, dynamic>> _stops = [];
  String? _selected;
  String _etaText = '';
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    unawaited(_loadStops());
    unawaited(_subscribe());
  }

  @override
  void dispose() {
    final client = supabase;
    final channel = _channel;
    if (client != null && channel != null) {
      unawaited(client.removeChannel(channel));
    }
    super.dispose();
  }

  Future<void> _loadStops() async {
    try {
      final res = await http.get(Uri.parse('$apiUrl/stops'));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final list = (body['stops'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _stops = list;
        _selected ??= list.isNotEmpty ? list.first['stop_id'] as String : null;
      });
      if (_selected != null) await _loadEta(_selected!);
    } catch (e) {
      if (mounted) setState(() => _etaText = 'API error: $e');
    }
  }

  Future<void> _subscribe() async {
    final client = supabase;
    if (client == null) {
      setState(() => _rtStatus = 'Waiting for Supabase keys (Phase 1B)');
      return;
    }

    try {
      final row = await client
          .from('shuttle_positions')
          .select('lat,lng,heading,updated_at')
          .eq('shuttle_id', defaultShuttleId)
          .maybeSingle();
      if (mounted && row != null) {
        setState(() => _position = Map<String, dynamic>.from(row));
      }
    } catch (e) {
      if (mounted) setState(() => _rtStatus = e.toString());
    }

    final channel = client
        .channel('shuttle_positions_rider')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'shuttle_positions',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'shuttle_id',
            value: defaultShuttleId,
          ),
          callback: (payload) {
            final row = payload.newRecord;
            if (row.isNotEmpty && mounted) {
              setState(() {
                _position = Map<String, dynamic>.from(row);
                _rtStatus = 'Live';
              });
            }
          },
        );
    _channel = channel;
    channel.subscribe((status, error) {
      if (!mounted) return;
      setState(() => _rtStatus = error?.toString() ?? status.name);
    });
  }

  Future<void> _loadEta(String stopId) async {
    try {
      final res = await http.get(
        Uri.parse('$apiUrl/eta?stop_id=${Uri.encodeQueryComponent(stopId)}'),
      );
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final eta = body['eta'] as Map<String, dynamic>?;
      final name = body['stop_name'] as String? ?? stopId;
      if (!mounted) return;
      if (eta == null) {
        setState(() => _etaText = '$name: no more departures today');
      } else {
        setState(() {
          _etaText =
              '$name: next ${eta['next_time']} (${eta['route']}, ${eta['day_group']})';
        });
      }
    } catch (e) {
      if (mounted) setState(() => _etaText = 'ETA error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final position = _position;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Rider',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          if (!hasSupabaseConfig)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(10),
              color: const Color(0xFFFFF4E5),
              child: const Text(
                'Live GPS needs Supabase. Schedule ETA still works via the local API.',
                style: TextStyle(color: Color(0xFF8A4B08)),
              ),
            ),
          const SizedBox(height: 8),
          Text('Realtime: $_rtStatus', style: const TextStyle(fontSize: 14)),
          const SizedBox(height: 4),
          if (position != null)
            Text(
              'Shuttle: ${(position['lat'] as num).toStringAsFixed(5)}, '
              '${(position['lng'] as num).toStringAsFixed(5)} '
              'heading=${position['heading'] ?? '—'}\n'
              'Updated: ${position['updated_at']}',
              style: const TextStyle(fontSize: 14),
            )
          else
            const Text('No position yet', style: TextStyle(fontSize: 14)),
          const SizedBox(height: 12),
          if (!hasArcgisApiKey)
            Container(
              height: 160,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFF0F4F2),
                border: Border.all(color: const Color(0xFFCDD9D3)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'Add ARCGIS_API_KEY to mobile/.env to show the campus map',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF4A5C54)),
              ),
            )
          else
            Expanded(
              flex: 3,
              child: CampusMapView(
                shuttleLat: position != null
                    ? (position['lat'] as num).toDouble()
                    : null,
                shuttleLng: position != null
                    ? (position['lng'] as num).toDouble()
                    : null,
              ),
            ),
          const SizedBox(height: 12),
          const Text(
            'Pick a stop for schedule ETA',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          Expanded(
            flex: hasArcgisApiKey ? 2 : 1,
            child: ListView.builder(
              itemCount: _stops.length,
              itemBuilder: (context, index) {
                final stop = _stops[index];
                final id = stop['stop_id'] as String;
                final selected = id == _selected;
                return ListTile(
                  dense: true,
                  selected: selected,
                  selectedTileColor: const Color(0xFFE8F5EF),
                  title: Text(stop['name'] as String? ?? id),
                  onTap: () {
                    setState(() => _selected = id);
                    unawaited(_loadEta(id));
                  },
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 8),
            child: Text(_etaText, style: const TextStyle(fontSize: 15)),
          ),
        ],
      ),
    );
  }
}
