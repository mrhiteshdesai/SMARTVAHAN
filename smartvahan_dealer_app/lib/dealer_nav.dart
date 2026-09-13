import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';

import 'api_holder.dart';

const String kSupportWhatsAppE164 = '919152126148';

bool dealerIsSystemAdmin() {
  final role = ApiHolder.user?['role']?.toString().toUpperCase() ?? '';
  return role == 'SUPER_ADMIN' || role == 'ADMIN';
}

bool dealerHasSldAccess() {
  if (dealerIsSystemAdmin()) return true;
  final u = ApiHolder.user;
  return u?['hasSldAccess'] == true ||
      (u?['sldOems'] is List && (u!['sldOems'] as List).isNotEmpty);
}

bool dealerHasReflectiveAccess() {
  if (dealerIsSystemAdmin()) return true;
  final u = ApiHolder.user;
  final oemsLabel = u?['oems']?.toString().trim() ?? '';
  return u?['hasReflectiveAccess'] == true || oemsLabel.isNotEmpty;
}

class DealerNavItem {
  final String route;
  final String label;
  final IconData icon;
  const DealerNavItem(this.route, this.label, this.icon);
}

List<DealerNavItem> dealerBottomNavItems() {
  return const [
    DealerNavItem('/home', 'Home', LucideIcons.house),
    DealerNavItem('/profile', 'Profile', LucideIcons.user),
    DealerNavItem('/support', 'Support', LucideIcons.headset),
  ];
}

int dealerNavIndexForRoute(String route) {
  final items = dealerBottomNavItems();
  for (var i = 0; i < items.length; i++) {
    if (items[i].route == route) return i;
  }
  return 0;
}

class DealerBottomNav extends StatelessWidget {
  final String currentRoute;
  const DealerBottomNav({super.key, required this.currentRoute});

  Widget _navIcon(IconData icon, bool selected) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFF12314D).withOpacity(0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(
        icon,
        color: selected ? const Color(0xFF12314D) : const Color(0xFF91A8BD),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = dealerBottomNavItems();
    final currentIndex = dealerNavIndexForRoute(currentRoute);

    return BottomNavigationBar(
      currentIndex: currentIndex.clamp(0, items.length - 1),
      type: BottomNavigationBarType.fixed,
      selectedItemColor: const Color(0xFF12314D),
      unselectedItemColor: const Color(0xFF91A8BD),
      onTap: (i) {
        if (i < 0 || i >= items.length) return;
        final target = items[i].route;
        if (target == currentRoute) return;
        Navigator.of(context).pushNamedAndRemoveUntil(target, (route) => false);
      },
      items: items
          .map(
            (item) => BottomNavigationBarItem(
              icon: _navIcon(item.icon, item.route == currentRoute),
              label: item.label,
            ),
          )
          .toList(),
    );
  }
}
