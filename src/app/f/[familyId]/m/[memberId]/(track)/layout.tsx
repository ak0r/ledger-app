// Route group (invisible in the URL) wrapping Accounts + Transactions.
// Previously rendered a TrackTabs sub-nav here, but that duplicated
// SidebarNav's own Accounts/Transactions items one level up (sidebar
// active-state already shows current location) — removed (product-polish
// delta plan #6). Plain pass-through now; kept as a route group so
// Account/Transaction detail, new, and edit routes can still share it later
// without a URL change.
export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
