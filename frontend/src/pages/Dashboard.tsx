export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-600">Overview of system health and activity</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="rounded-md border px-2 py-1 text-sm" aria-label="Filter by date" />
          <button className="rounded-md bg-primary text-white px-3 py-2 text-sm hover:bg-indigo-600">Export</button>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPI title="Bounce Rate" value="32.53%" trend="-0.55%" trendType="down" />
        <KPI title="Page Views" value="7,682" trend="+0.11%" trendType="up" />
        <KPI title="New Sessions" value="68.8" trend="-68.8" trendType="down" />
        <KPI title="Avg. Time on Site" value="2m:35s" trend="+0.8%" trendType="up" />
        <KPI title="New Sessions" value="68.8" trend="-68.8" trendType="down" />
        <KPI title="Avg. Time on Site" value="2m:35s" trend="+0.8%" trendType="up" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Market Overview" subtitle="This month" actions={["Share", "Print"]} className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-500">Total Value</div>
              <div className="text-2xl font-semibold">$36,2531.00</div>
              <div className="text-xs text-green-600 font-medium">(+1.37%)</div>
            </div>
            <div className="md:col-span-2">
              <MiniBarChart />
            </div>
          </div>
        </Card>
        <Card title="Todo List" subtitle="Today" actions={["Add"]}>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span>Verify dealer KYC</span>
              <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs">Due tomorrow</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Monthly report export</span>
              <span className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs">Done</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Audit log review</span>
              <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Expired</span>
            </li>
          </ul>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent Sales" subtitle="Today">
          <TablePlaceholder
            headers={["#", "Dealer", "Description", "Amount", "Status"]}
            rows={[
              ["#2457", "Brandon Jacob", "Certificate print", "$64", "Approved"],
              ["#2147", "Bridie Kessler", "QR reissue", "$47", "Pending"],
              ["#2049", "Ashleigh Langosh", "Bulk download", "$147", "Approved"],
              ["#2644", "Angus Grady", "Certificate cancel", "$67", "Rejected"],
              ["#2644", "Raheem Lehner", "New registration", "$165", "Approved"]
            ]}
          />
        </Card>
        <Card title="Top Selling" subtitle="Today">
          <TablePlaceholder
            headers={["Preview", "Product", "Price", "Sold", "Revenue"]}
            rows={[
              ["—", "Premium Certificate Kit", "$64", "124", "$5,828"],
              ["—", "Dealer QR Pack", "$46", "98", "$4,508"],
              ["—", "Secure Hologram", "$59", "74", "$4,366"],
              ["—", "Tamper-evident Label", "$32", "63", "$2,016"],
              ["—", "Archival Sleeve", "$79", "41", "$3,239"]
            ]}
          />
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Budget Report" subtitle="This Month" className="lg:col-span-2">
          <div className="h-48 bg-gray-50 rounded-md grid place-items-center text-gray-400 text-sm">Chart placeholder</div>
        </Card>
        <Card title="Website Traffic" subtitle="Today">
          <div className="h-48 bg-gray-50 rounded-md grid place-items-center text-gray-400 text-sm">Chart placeholder</div>
        </Card>
      </section>

      <section>
        <Card title="News & Updates" subtitle="Today">
          <ul className="space-y-3 text-sm">
            <li>
              <div className="font-medium">System maintenance completed</div>
              <div className="text-gray-600">All services operational.</div>
            </li>
            <li>
              <div className="font-medium">New dealer onboarding guide</div>
              <div className="text-gray-600">Updated documentation released.</div>
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

function KPI({
  title,
  value,
  trend,
  trendType
}: {
  title: string;
  value: string;
  trend: string;
  trendType: "up" | "down";
}) {
  const trendColor = trendType === "up" ? "text-green-600" : "text-red-600";
  return (
    <div className="p-4 bg-white rounded-lg border">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      <div className={`text-xs ${trendColor}`}>{trend}</div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  actions,
  className,
  children
}: {
  title: string;
  subtitle?: string;
  actions?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border bg-white ${className ?? ""}`}>
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <div className="font-medium">{title}</div>
          {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
        </div>
        {actions && actions.length > 0 && (
          <div className="flex items-center gap-2">
            {actions.map((a) => (
              <button key={a} className="px-2 py-1 text-xs rounded-md border hover:bg-gray-50">
                {a}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function TablePlaceholder({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 border-b">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              {r.map((c, i) => (
                <td key={i} className="px-3 py-2 border-b">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniBarChart() {
  const values = [30, 40, 35, 45, 50, 60, 55, 65, 70, 60, 75, 80];
  return (
    <div className="flex items-end gap-1 h-24 bg-gray-50 rounded-md p-2">
      {values.map((v, i) => (
        <div key={i} className="w-3 bg-primary/70 rounded-sm" style={{ height: `${v}%` }}></div>
      ))}
    </div>
  );
}
