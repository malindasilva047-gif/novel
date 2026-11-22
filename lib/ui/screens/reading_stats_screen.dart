import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/app_bootstrap.dart';
import '../../data/services/api_service.dart';

class ReadingStatsScreen extends StatefulWidget {
  const ReadingStatsScreen({super.key, required this.profile, this.apiService});
  final ProfileModel profile;
  final ApiService? apiService;
  @override
  State<ReadingStatsScreen> createState() => _ReadingStatsScreenState();
}

class _ReadingStatsScreenState extends State<ReadingStatsScreen> {
  List<double> _minutes = List<double>.filled(7, 0);
  final _labels = const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  bool _loading = true;
  int _booksRead = 0;
  int _pagesRead = 0;
  int _streak = 0;
  String _readingTimeLabel = '0h 0m';
  int _monthBooks = 0;
  double _goalPct = 0.75;
  final List<(String, int)> _topGenres = [];
  static const _purple = Color(0xFF16856A);

  @override
  void initState() {
    super.initState();
    _booksRead = widget.profile.chaptersRead > 0
        ? (widget.profile.chaptersRead / 8).ceil()
        : 0;
    _streak = widget.profile.dayStreak;
    _load();
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('reading_seconds_by_day_v1') ?? '{}';
      final map = Map<String, dynamic>.from((jsonDecode(raw) as Map?) ?? {});
      final now = DateTime.now();
      final monday = DateTime(
        now.year,
        now.month,
        now.day,
      ).subtract(Duration(days: now.weekday - 1));
      final mins = <double>[];
      var totalSec = 0;
      for (var i = 0; i < 7; i++) {
        final d = monday.add(Duration(days: i));
        final key =
            '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
        final sec = (map[key] as num?)?.toInt() ?? 0;
        totalSec += sec;
        mins.add(sec / 60.0);
      }
      final h = totalSec ~/ 3600;
      final m = (totalSec % 3600) ~/ 60;
      _readingTimeLabel = '${h}h ${m}m';
      _pagesRead = _booksRead * 180;
      _monthBooks = _booksRead.clamp(0, 6);

      if (widget.apiService != null) {
        try {
          final remote = await widget.apiService!.fetchReadingStats();
          if (remote.isNotEmpty) {
            _booksRead = (remote['books_read'] as num?)?.toInt() ?? _booksRead;
            _pagesRead = (remote['pages_read'] as num?)?.toInt() ?? _pagesRead;
            _streak = (remote['current_streak'] as num?)?.toInt() ?? _streak;
            _monthBooks =
                (remote['month_books'] as num?)?.toInt() ?? _monthBooks;
            _goalPct = ((remote['goal_pct'] as num?)?.toDouble() ?? 75) / 100.0;
            final genres = remote['top_genres'];
            if (genres is List) {
              _topGenres.clear();
              for (final g in genres) {
                if (g is Map) {
                  _topGenres.add((
                    (g['name'] ?? '').toString(),
                    (g['count'] as num?)?.toInt() ?? 0,
                  ));
                }
              }
            }
            final rt = remote['reading_time_label']?.toString();
            if (rt != null && rt.isNotEmpty) _readingTimeLabel = rt;
          }
        } catch (_) {}
      }
      if (_topGenres.isEmpty) {
        _topGenres.addAll(const [
          ('Fantasy', 12),
          ('Romance', 8),
          ('Thriller', 5),
        ]);
      }
      if (mounted) {
        setState(() {
          _minutes = mins;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxM = _minutes.fold<double>(0, (a, b) => a > b ? a : b);
    final scale = maxM <= 0 ? 1.0 : maxM;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reading Stats'),
        centerTitle: true,
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _metric(
                        '$_booksRead',
                        'Books Read',
                        const Color(0xFF35A486),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _metric(
                        '$_pagesRead',
                        'Pages Read',
                        const Color(0xFF16856A),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _metric(
                        _readingTimeLabel,
                        'Reading Time',
                        const Color(0xFF35A486),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _metric(
                        '$_streak',
                        'Current Streak',
                        const Color(0xFF35A486),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: _card(context),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'This Month',
                              style: TextStyle(
                                color: AppTheme.mutedOf(context),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '$_monthBooks',
                              style: const TextStyle(
                                fontSize: 28,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const Text(
                              'Books Read',
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(
                        width: 88,
                        height: 88,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            SizedBox(
                              width: 88,
                              height: 88,
                              child: CircularProgressIndicator(
                                value: _goalPct.clamp(0.0, 1.0),
                                strokeWidth: 8,
                                backgroundColor: _purple.withValues(
                                  alpha: 0.15,
                                ),
                                color: _purple,
                              ),
                            ),
                            Text(
                              '${(_goalPct * 100).round()}%\nof your goal',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
                  decoration: _card(context),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Reading Activity',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 16,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: _purple.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Text(
                              'This Week',
                              style: TextStyle(
                                color: _purple,
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 140,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: List.generate(7, (i) {
                            final h = 12.0 + (_minutes[i] / scale) * 100.0;
                            return Expanded(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    Container(
                                      height: h,
                                      decoration: BoxDecoration(
                                        color: _purple.withValues(alpha: 0.85),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      _labels[i],
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          }),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: _card(context),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Top Genres',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 14),
                      for (final g in _topGenres) ...[
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                g.$1,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Text(
                              '${g.$2} books',
                              style: TextStyle(
                                color: AppTheme.mutedOf(context),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(
                            value:
                                (g.$2 /
                                        (_topGenres.first.$2 == 0
                                            ? 1
                                            : _topGenres.first.$2))
                                    .clamp(0.15, 1.0),
                            minHeight: 8,
                            backgroundColor: _purple.withValues(alpha: 0.12),
                            color: _purple,
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  BoxDecoration _card(BuildContext context) => BoxDecoration(
    color: AppTheme.surfaceOf(context),
    borderRadius: BorderRadius.circular(16),
    border: Border.all(color: AppTheme.borderOf(context)),
  );
  Widget _metric(String value, String label, Color color) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: color.withValues(alpha: 0.22)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppTheme.mutedOf(context),
          ),
        ),
      ],
    ),
  );
}
