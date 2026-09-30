import 'package:flutter/material.dart';

class Dimensions {
  final double screenWidth;
  final double screenHeight;

  Dimensions(BuildContext context)
      : screenWidth = MediaQuery.sizeOf(context).width,
        screenHeight = MediaQuery.sizeOf(context).height;
}
