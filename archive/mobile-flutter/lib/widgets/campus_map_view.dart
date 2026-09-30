import 'package:arcgis_maps/arcgis_maps.dart';
import 'package:flutter/material.dart';

/// UHCL Bayou Building area — good default campus overview.
const uhclCampusCenter = (-95.1037, 29.5775);
const uhclOverviewScale = 12000.0;

/// ArcGIS map centered on UHCL. Optionally plots a shuttle Graphic.
class CampusMapView extends StatefulWidget {
  const CampusMapView({
    super.key,
    this.shuttleLat,
    this.shuttleLng,
  });

  final double? shuttleLat;
  final double? shuttleLng;

  @override
  State<CampusMapView> createState() => _CampusMapViewState();
}

class _CampusMapViewState extends State<CampusMapView> {
  final _mapViewController = ArcGISMapView.createController();
  late final GraphicsOverlay _shuttleOverlay;

  @override
  void initState() {
    super.initState();
    _shuttleOverlay = GraphicsOverlay();
  }

  void _onMapViewReady() {
    final map = ArcGISMap.withBasemapStyle(BasemapStyle.arcGISStreets);
    map.initialViewpoint = Viewpoint.fromCenter(
      ArcGISPoint(
        x: uhclCampusCenter.$1,
        y: uhclCampusCenter.$2,
        spatialReference: SpatialReference.wgs84,
      ),
      scale: uhclOverviewScale,
    );
    _mapViewController.arcGISMap = map;
    _mapViewController.graphicsOverlays.add(_shuttleOverlay);
    _updateShuttleGraphic();
  }

  @override
  void didUpdateWidget(covariant CampusMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.shuttleLat != widget.shuttleLat ||
        oldWidget.shuttleLng != widget.shuttleLng) {
      _updateShuttleGraphic();
    }
  }

  void _updateShuttleGraphic() {
    _shuttleOverlay.graphics.clear();
    final lat = widget.shuttleLat;
    final lng = widget.shuttleLng;
    if (lat == null || lng == null) return;

    final point = ArcGISPoint(
      x: lng,
      y: lat,
      spatialReference: SpatialReference.wgs84,
    );
    final symbol = SimpleMarkerSymbol(
      style: SimpleMarkerSymbolStyle.circle,
      color: const Color(0xFF0B6E4F),
      size: 14,
    );
    _shuttleOverlay.graphics.add(Graphic(geometry: point, symbol: symbol));
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: ArcGISMapView(
        controllerProvider: () => _mapViewController,
        onMapViewReady: _onMapViewReady,
      ),
    );
  }
}
