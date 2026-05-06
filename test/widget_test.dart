// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';

import 'package:any_nanny/main.dart';

void main() {
  testWidgets('Welcome screen renders role actions', (WidgetTester tester) async {
    await tester.pumpWidget(const AnyNannyApp());

    expect(find.text('Welcome to AnyNanny'), findsOneWidget);
    expect(find.text('I am a Parent'), findsOneWidget);
    expect(find.text('I am a Babysitter'), findsOneWidget);
  });
}
