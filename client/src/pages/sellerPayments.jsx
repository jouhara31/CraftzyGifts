import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useHashScroll from "../utils/useHashScroll";
import { API_URL } from "../apiBase";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const toCsvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const payoutStatusClass = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  if (["paid", "ready"].includes(normalized)) return "success";
  if (["requested", "processing", "holding"].includes(normalized)) return "warning";
  if (["reversed", "rejected"].includes(normalized)) return "locked";
  return "info";
};

const formatStatus = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function SellerPayments() {
  useHashScroll();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [finance, setFinance] = useState({
    settings: {},
    summary: {},
    settlements: [],
    payoutBatches: [],
  });
  const [loading, setLoading] = useState(true);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPayments = useCallback(async () => {
    const token = String(localStorage.getItem("token") || "").trim();
    if (!token) {
      navigate("/login");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [financeRes, profileRes] = await Promise.all([
        fetch(`${API_URL}/api/orders/seller/finance`, { headers }),
        fetch(`${API_URL}/api/users/me`, { headers }),
      ]);
      const [financeData, profileData] = await Promise.all([
        financeRes.json().catch(() => ({})),
        profileRes.json().catch(() => ({})),
      ]);

      if (!financeRes.ok) {
        setError(financeData?.message || "Unable to load seller finance data.");
        return;
      }
      if (!profileRes.ok) {
        setError(profileData?.message || "Unable to load seller finance profile.");
        return;
      }

      setFinance({
        settings: financeData?.settings || {},
        summary: financeData?.summary || {},
        settlements: Array.isArray(financeData?.settlements) ? financeData.settlements : [],
        payoutBatches: Array.isArray(financeData?.payoutBatches) ? financeData.payoutBatches : [],
      });
      setProfile(profileData);
    } catch {
      setError("Unable to load seller finance data.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const recentSettlements = useMemo(
    () =>
      [...finance.settlements]
        .filter((entry) => entry.status !== "pending_payment")
        .sort(
          (left, right) =>
            new Date(right.settledAt || right.requestedAt || right.eligibleAt || right.updatedAt || 0) -
            new Date(left.settledAt || left.requestedAt || left.eligibleAt || left.updatedAt || 0)
        )
        .slice(0, 8),
    [finance.settlements]
  );

  const pendingCollections = useMemo(
    () => finance.settlements.filter((entry) => entry.status === "pending_payment"),
    [finance.settlements]
  );

  const recentTransactions = useMemo(
    () =>
      [...finance.settlements]
        .sort(
          (left, right) =>
            new Date(right.lastSyncedAt || right.updatedAt || right.createdAt || 0) -
            new Date(left.lastSyncedAt || left.updatedAt || left.createdAt || 0)
        )
        .slice(0, 12),
    [finance.settlements]
  );

  const settlementCycleLabel =
    String(finance?.settings?.payoutSchedule || "").trim() || "weekly";

  const downloadSettlements = () => {
    setError("");
    setNotice("");

    if (!finance.settlements.length) {
      setNotice("No settlement records to export.");
      return;
    }

    const headers = [
      "Order",
      "Settlement Status",
      "Order Status",
      "Gross",
      "Commission",
      "Refund",
      "Net",
      "Eligible",
      "Reference",
    ];
    const rows = finance.settlements.map((entry) => [
      entry.orderCode,
      entry.status,
      entry.orderStatus,
      entry.grossAmount,
      entry.commissionAmount,
      entry.refundAmount,
      entry.netAmount,
      entry.eligibleAt ? new Date(entry.eligibleAt).toLocaleDateString("en-IN") : "",
      entry.payoutReference || entry.paymentReference || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `seller-settlements-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    setNotice("Settlement report downloaded.");
  };

  const requestPayout = async () => {
    const token = String(localStorage.getItem("token") || "").trim();
    if (!token) {
      navigate("/login");
      return;
    }

    setRequestingPayout(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/orders/seller/finance/payouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.message || "Unable to create payout request.");
        return;
      }
      setNotice(
        data?.batch?.reference
          ? `Payout request ${data.batch.reference} created.`
          : data?.message || "Payout request created."
      );
      await loadPayments();
    } catch {
      setError("Unable to create payout request.");
    } finally {
      setRequestingPayout(false);
    }
  };

  return (
    <div className="seller-shell-view seller-payments-page">
      <div className="section-head">
        <div>
          <h2>Payments</h2>
          <p>Track commissions, payout-ready settlements, requests, and refund reversals.</p>
        </div>
        <div className="seller-toolbar">
          <button className="btn ghost" type="button" onClick={downloadSettlements}>
            Download settlements
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={requestPayout}
            disabled={requestingPayout || Number(finance?.summary?.availableBalance || 0) <= 0}
          >
            {requestingPayout ? "Requesting..." : "Request payout"}
          </button>
          <button className="btn ghost" type="button" onClick={loadPayments}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="field-hint">Loading payment data...</p> : null}
      {error ? <p className="field-hint">{error}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}

      <div className="seller-payments">
        <div className="seller-panel seller-anchor-section" id="payments-summary">
          <div className="card-head">
            <h3 className="card-title">Payout summary</h3>
            <span className="chip">{finance?.summary?.readyCount || 0} ready settlements</span>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-label">Gross collected</p>
              <p className="stat-value">{money(finance?.summary?.gross)}</p>
              <p className="stat-delta">Paid seller orders</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Commission total</p>
              <p className="stat-value">{money(finance?.summary?.commission)}</p>
              <p className="stat-delta">
                {Number(finance?.settings?.sellerCommissionPercent || 0)}% platform fee
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Refund reversals</p>
              <p className="stat-value">{money(finance?.summary?.refunds)}</p>
              <p className="stat-delta">{finance?.summary?.reversedCount || 0} reversed settlements</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Available balance</p>
              <p className="stat-value">{money(finance?.summary?.availableBalance)}</p>
              <p className="stat-delta">Ready to request for payout</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Requested balance</p>
              <p className="stat-value">{money(finance?.summary?.requestedBalance)}</p>
              <p className="stat-delta">{finance?.summary?.requestedCount || 0} settlements in payout queue</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Paid out</p>
              <p className="stat-value">{money(finance?.summary?.paidOutBalance)}</p>
              <p className="stat-delta">{finance?.summary?.paidCount || 0} completed settlements</p>
            </div>
          </div>
        </div>

        <div className="seller-panel seller-anchor-section" id="payments-settlements">
          <div className="card-head">
            <h3 className="card-title">Settlement ledger</h3>
            <span className="chip">{recentSettlements.length} recent entries</span>
          </div>
          <div className="payout-grid">
            {recentSettlements.map((entry) => (
              <article key={entry.id} className="payout-card">
                <div className="payout-head">
                  <span>{entry.orderCode}</span>
                  <span className={`status-pill ${payoutStatusClass(entry.status)}`}>
                    {formatStatus(entry.status)}
                  </span>
                </div>
                <p className="payout-amount">{money(entry.netAmount)}</p>
                <p className="payout-sub">{entry.productName}</p>
                <p className="payout-sub">
                  Gross {money(entry.grossAmount)} · Fee {money(entry.commissionAmount)}
                </p>
                <p className="payout-sub">
                  Eligible:{" "}
                  {entry.eligibleAt ? new Date(entry.eligibleAt).toLocaleDateString("en-IN") : "Pending"}
                </p>
                <p className="payout-sub">
                  Ref: {entry.payoutReference || entry.paymentReference || entry.orderId}
                </p>
              </article>
            ))}
            {!loading && recentSettlements.length === 0 ? (
              <p className="field-hint">No settlement entries yet.</p>
            ) : null}
          </div>
        </div>

        <div className="seller-panel seller-anchor-section" id="payments-pending">
          <div className="card-head">
            <h3 className="card-title">Pending collections</h3>
            <span className="chip">{pendingCollections.length} orders</span>
          </div>
          <div className="payout-grid">
            {pendingCollections.map((entry) => (
              <article key={entry.id} className="payout-card">
                <div className="payout-head">
                  <span>{entry.orderCode}</span>
                  <span className={`status-pill ${payoutStatusClass(entry.status)}`}>
                    {formatStatus(entry.status)}
                  </span>
                </div>
                <p className="payout-amount">{money(entry.grossAmount)}</p>
                <p className="payout-sub">{entry.productName}</p>
                <p className="payout-sub">
                  {formatStatus(entry.paymentMode)} · {formatStatus(entry.orderStatus)}
                </p>
                <p className="payout-sub">{entry.note || "Awaiting payment or delivery confirmation."}</p>
              </article>
            ))}
            {!loading && pendingCollections.length === 0 ? (
              <p className="field-hint">No pending payment collections right now.</p>
            ) : null}
          </div>
        </div>

        <div className="seller-panel seller-anchor-section" id="payments-transactions">
          <div className="card-head">
            <h3 className="card-title">Transaction list</h3>
            <span className="chip">{recentTransactions.length} recent entries</span>
          </div>
          <div className="payout-grid">
            {recentTransactions.map((entry) => (
              <article key={entry.id} className="payout-card">
                <div className="payout-head">
                  <span>{entry.orderCode}</span>
                  <span className={`status-pill ${payoutStatusClass(entry.paymentStatus || entry.status)}`}>
                    {formatStatus(entry.paymentStatus || entry.status)}
                  </span>
                </div>
                <p className="payout-amount">{money(entry.grossAmount)}</p>
                <p className="payout-sub">{entry.productName}</p>
                <p className="payout-sub">
                  {formatStatus(entry.paymentMode)} ·{" "}
                  {entry.lastSyncedAt
                    ? new Date(entry.lastSyncedAt).toLocaleDateString("en-IN")
                    : "-"}
                </p>
                <p className="payout-sub">
                  Txn: {entry.paymentReference || entry.payoutReference || entry.orderId}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="seller-panel seller-anchor-section" id="payments-finance">
          <div className="card-head">
            <h3 className="card-title">Finance profile</h3>
            <span className="chip">
              {profile?.sellerBankDetails?.accountHolderName ? "Bank ready" : "Needs bank details"}
            </span>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-label">Account holder</p>
              <p className="stat-value">
                {profile?.sellerBankDetails?.accountHolderName || "Not added"}
              </p>
              <p className="stat-delta">Saved in seller settings</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Bank / UPI</p>
              <p className="stat-value">
                {profile?.sellerBankDetails?.bankName || profile?.sellerBankDetails?.upiId || "Not added"}
              </p>
              <p className="stat-delta">Used for seller payout follow-ups</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Settlement cycle</p>
              <p className="stat-value">{formatStatus(settlementCycleLabel)}</p>
              <p className="stat-delta">
                Delay: {Number(finance?.settings?.settlementDelayDays || 0)} days after delivery
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Commission details</p>
              <p className="stat-value">
                {Number(finance?.settings?.sellerCommissionPercent || 0)}%
              </p>
              <p className="stat-delta">Applied automatically to payout-ready orders</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Payout requests</p>
              <p className="stat-value">{finance?.payoutBatches?.length || 0}</p>
              <p className="stat-delta">Recent seller payout batches</p>
            </div>
          </div>

          <div className="payout-grid" style={{ marginTop: "1rem" }}>
            {finance.payoutBatches.map((batch) => (
              <article key={batch.id} className="payout-card">
                <div className="payout-head">
                  <span>{batch.reference}</span>
                  <span className={`status-pill ${payoutStatusClass(batch.status)}`}>
                    {formatStatus(batch.status)}
                  </span>
                </div>
                <p className="payout-amount">{money(batch.totalAmount)}</p>
                <p className="payout-sub">{batch.settlementCount} settlements</p>
                <p className="payout-sub">
                  Requested:{" "}
                  {batch.requestedAt ? new Date(batch.requestedAt).toLocaleDateString("en-IN") : "-"}
                </p>
                <p className="payout-sub">{batch.note || "No note added."}</p>
              </article>
            ))}
            {!loading && finance.payoutBatches.length === 0 ? (
              <p className="field-hint">No payout requests have been created yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
