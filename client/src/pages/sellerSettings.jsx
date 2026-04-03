import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "../apiBase";
import {
  apiFetchJson,
  clearAuthSession,
  hasActiveSession,
  persistStoredUser,
  readRefreshToken,
  readStoredUser,
} from "../utils/authSession";
import useHashScroll from "../utils/useHashScroll";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeInstagramInput = (value) => String(value || "").trim();

const looksLikeInstagramUrl = (value) => {
  const text = normalizeInstagramInput(value);
  if (!text) return true;

  try {
    const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const url = new URL(candidate);
    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    if (hostname !== "instagram.com") return false;
    if (segments.length !== 1) return false;
    return !["p", "reel", "reels", "explore", "stories", "accounts"].includes(
      String(segments[0] || "").toLowerCase()
    );
  } catch {
    return false;
  }
};

export default function SellerSettings() {
  const navigate = useNavigate();
  useHashScroll();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [returnWindowDays, setReturnWindowDays] = useState("7");
  const [supportEmail, setSupportEmail] = useState("");
  const [legalBusinessName, setLegalBusinessName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [billingAddress, setBillingAddress] = useState({
    line1: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [bankDetails, setBankDetails] = useState({
    accountHolderName: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    upiId: "",
  });
  const [notificationSettings, setNotificationSettings] = useState({
    orderUpdates: true,
    customerMessages: true,
    payoutUpdates: true,
    lowStockAlerts: true,
    marketingEmails: false,
  });
  const [securitySettings, setSecuritySettings] = useState({
    loginOtpEnabled: false,
  });
  const [documents, setDocuments] = useState({
    panNumber: "",
    panDocumentUrl: "",
    gstCertificateUrl: "",
    kycDocumentUrl: "",
    agreementNotes: "",
    invoiceTemplate: "compact",
  });
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionActionId, setSessionActionId] = useState("");
  const [verificationPreviewPath, setVerificationPreviewPath] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadProfile = useCallback(async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/users/me`);
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to load seller settings.");
        return;
      }

      setProfile(data);
      setInstagramUrl(String(data?.instagramUrl || "").trim());
      setReturnWindowDays(String(data?.returnWindowDays ?? 7));
      setSupportEmail(String(data?.supportEmail || "").trim());
      setLegalBusinessName(
        String(data?.legalBusinessName || data?.storeName || data?.name || "").trim()
      );
      setGstNumber(String(data?.gstNumber || "").trim());
      setBillingAddress({
        line1: String(data?.billingAddress?.line1 || "").trim(),
        city: String(data?.billingAddress?.city || "").trim(),
        state: String(data?.billingAddress?.state || "").trim(),
        pincode: String(data?.billingAddress?.pincode || "").trim(),
      });
      setBankDetails({
        accountHolderName: String(data?.sellerBankDetails?.accountHolderName || "").trim(),
        bankName: String(data?.sellerBankDetails?.bankName || "").trim(),
        accountNumber: String(data?.sellerBankDetails?.accountNumber || "").trim(),
        ifscCode: String(data?.sellerBankDetails?.ifscCode || "").trim(),
        upiId: String(data?.sellerBankDetails?.upiId || "").trim(),
      });
      setNotificationSettings({
        orderUpdates: Boolean(data?.sellerNotificationSettings?.orderUpdates ?? true),
        customerMessages: Boolean(data?.sellerNotificationSettings?.customerMessages ?? true),
        payoutUpdates: Boolean(data?.sellerNotificationSettings?.payoutUpdates ?? true),
        lowStockAlerts: Boolean(data?.sellerNotificationSettings?.lowStockAlerts ?? true),
        marketingEmails: Boolean(data?.sellerNotificationSettings?.marketingEmails),
      });
      setSecuritySettings({
        loginOtpEnabled: Boolean(data?.sellerSecuritySettings?.loginOtpEnabled),
      });
      setDocuments({
        panNumber: String(data?.sellerDocuments?.panNumber || "").trim(),
        panDocumentUrl: String(data?.sellerDocuments?.panDocumentUrl || "").trim(),
        gstCertificateUrl: String(data?.sellerDocuments?.gstCertificateUrl || "").trim(),
        kycDocumentUrl: String(data?.sellerDocuments?.kycDocumentUrl || "").trim(),
        agreementNotes: String(data?.sellerDocuments?.agreementNotes || "").trim(),
        invoiceTemplate: String(data?.sellerDocuments?.invoiceTemplate || "compact").trim() || "compact",
      });
    } catch {
      setError("Unable to load seller settings.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect]);

  const loadSessions = useCallback(async () => {
    if (!hasActiveSession()) return;

    setSessionsLoading(true);
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/users/me/sessions`, {
        headers: {
          "X-Refresh-Token": readRefreshToken(),
        },
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        throw new Error(data?.message || "Unable to load active sessions.");
      }
      setSessions(Array.isArray(data?.items) ? data.items : []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load active sessions.");
    } finally {
      setSessionsLoading(false);
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadProfile();
    loadSessions();
  }, [loadProfile, loadSessions]);

  const previewUrl = useMemo(() => {
    const text = normalizeInstagramInput(instagramUrl);
    if (!text || !looksLikeInstagramUrl(text)) return "";
    return /^https?:\/\//i.test(text) ? text : `https://${text}`;
  }, [instagramUrl]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    const normalizedValue = normalizeInstagramInput(instagramUrl);
    if (!looksLikeInstagramUrl(normalizedValue)) {
      setError("Please enter a valid Instagram profile link.");
      setNotice("");
      return;
    }
    const parsedReturnWindowDays = Number.parseInt(returnWindowDays, 10);
    if (!Number.isInteger(parsedReturnWindowDays) || parsedReturnWindowDays < 0 || parsedReturnWindowDays > 30) {
      setError("Return days must be a whole number from 0 to 30.");
      setNotice("");
      return;
    }
    const normalizedSupportEmail = String(supportEmail || "").trim().toLowerCase();
    if (normalizedSupportEmail && !EMAIL_PATTERN.test(normalizedSupportEmail)) {
      setError("Please enter a valid support email address.");
      setNotice("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instagramUrl: normalizedValue,
          returnWindowDays: parsedReturnWindowDays,
          supportEmail: normalizedSupportEmail,
          legalBusinessName: legalBusinessName.trim(),
          gstNumber: gstNumber.trim().toUpperCase(),
          billingAddress,
          sellerBankDetails: {
            accountHolderName: bankDetails.accountHolderName.trim(),
            bankName: bankDetails.bankName.trim(),
            accountNumber: bankDetails.accountNumber.trim(),
            ifscCode: bankDetails.ifscCode.trim().toUpperCase(),
            upiId: bankDetails.upiId.trim(),
          },
          sellerNotificationSettings: notificationSettings,
          sellerSecuritySettings: securitySettings,
          sellerDocuments: {
            panNumber: documents.panNumber.trim().toUpperCase(),
            panDocumentUrl: documents.panDocumentUrl.trim(),
            gstCertificateUrl: documents.gstCertificateUrl.trim(),
            kycDocumentUrl: documents.kycDocumentUrl.trim(),
            agreementNotes: documents.agreementNotes.trim(),
            invoiceTemplate: documents.invoiceTemplate,
          },
        }),
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to save seller settings.");
        return;
      }

      const currentUser = readStoredUser() || {};
      persistStoredUser({
        ...(currentUser && typeof currentUser === "object" ? currentUser : {}),
        instagramUrl: data?.instagramUrl || normalizedValue,
        returnWindowDays: Number(data?.returnWindowDays ?? parsedReturnWindowDays),
        supportEmail: data?.supportEmail || normalizedSupportEmail,
        legalBusinessName: data?.legalBusinessName || legalBusinessName.trim(),
        gstNumber: data?.gstNumber || gstNumber.trim().toUpperCase(),
        billingAddress:
          data?.billingAddress && typeof data.billingAddress === "object"
            ? data.billingAddress
            : billingAddress,
      });
      setProfile((prev) => ({ ...(prev || {}), ...data }));
      setInstagramUrl(String(data?.instagramUrl || normalizedValue || "").trim());
      setReturnWindowDays(String(data?.returnWindowDays ?? parsedReturnWindowDays));
      setSupportEmail(String(data?.supportEmail || normalizedSupportEmail || "").trim());
      setLegalBusinessName(
        String(data?.legalBusinessName || legalBusinessName.trim() || "").trim()
      );
      setGstNumber(String(data?.gstNumber || gstNumber.trim().toUpperCase() || "").trim());
      setBillingAddress({
        line1: String(data?.billingAddress?.line1 || billingAddress.line1 || "").trim(),
        city: String(data?.billingAddress?.city || billingAddress.city || "").trim(),
        state: String(data?.billingAddress?.state || billingAddress.state || "").trim(),
        pincode: String(data?.billingAddress?.pincode || billingAddress.pincode || "").trim(),
      });
      setBankDetails({
        accountHolderName: String(
          data?.sellerBankDetails?.accountHolderName || bankDetails.accountHolderName || ""
        ).trim(),
        bankName: String(data?.sellerBankDetails?.bankName || bankDetails.bankName || "").trim(),
        accountNumber: String(
          data?.sellerBankDetails?.accountNumber || bankDetails.accountNumber || ""
        ).trim(),
        ifscCode: String(data?.sellerBankDetails?.ifscCode || bankDetails.ifscCode || "").trim(),
        upiId: String(data?.sellerBankDetails?.upiId || bankDetails.upiId || "").trim(),
      });
      setNotificationSettings({
        orderUpdates: Boolean(data?.sellerNotificationSettings?.orderUpdates ?? notificationSettings.orderUpdates),
        customerMessages: Boolean(
          data?.sellerNotificationSettings?.customerMessages ?? notificationSettings.customerMessages
        ),
        payoutUpdates: Boolean(data?.sellerNotificationSettings?.payoutUpdates ?? notificationSettings.payoutUpdates),
        lowStockAlerts: Boolean(
          data?.sellerNotificationSettings?.lowStockAlerts ?? notificationSettings.lowStockAlerts
        ),
        marketingEmails: Boolean(
          data?.sellerNotificationSettings?.marketingEmails ?? notificationSettings.marketingEmails
        ),
      });
      setSecuritySettings({
        loginOtpEnabled: Boolean(
          data?.sellerSecuritySettings?.loginOtpEnabled ?? securitySettings.loginOtpEnabled
        ),
      });
      setDocuments({
        panNumber: String(data?.sellerDocuments?.panNumber || documents.panNumber || "").trim(),
        panDocumentUrl: String(
          data?.sellerDocuments?.panDocumentUrl || documents.panDocumentUrl || ""
        ).trim(),
        gstCertificateUrl: String(
          data?.sellerDocuments?.gstCertificateUrl || documents.gstCertificateUrl || ""
        ).trim(),
        kycDocumentUrl: String(
          data?.sellerDocuments?.kycDocumentUrl || documents.kycDocumentUrl || ""
        ).trim(),
        agreementNotes: String(
          data?.sellerDocuments?.agreementNotes || documents.agreementNotes || ""
        ).trim(),
        invoiceTemplate:
          String(data?.sellerDocuments?.invoiceTemplate || documents.invoiceTemplate || "compact")
            .trim() || "compact",
      });
      setNotice("Seller settings updated successfully.");
    } catch {
      setError("Unable to save seller settings.");
    } finally {
      setSaving(false);
    }
  };

  const requestVerificationLink = async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/auth/verify-email/request`, {
        method: "POST",
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to prepare a verification link.");
        return;
      }
      setVerificationPreviewPath(String(data?.verificationPath || "").trim());
      setNotice(data?.message || "Verification link prepared successfully.");
      await loadProfile();
    } catch {
      setError("Unable to prepare a verification link.");
    }
  };

  const revokeSession = async (sessionId) => {
    const refreshToken = readRefreshToken();
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setSessionActionId(sessionId);
    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/users/me/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          "X-Refresh-Token": refreshToken,
        },
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to revoke this session.");
        return;
      }
      setSessions(Array.isArray(data?.items) ? data.items : []);
      setNotice(data?.message || "Session revoked successfully.");
      if (data?.revokedCurrent) {
        clearAndRedirect();
      }
    } catch {
      setError("Unable to revoke this session.");
    } finally {
      setSessionActionId("");
    }
  };

  const storeEditorPath = profile?.id ? `/seller/store/${profile.id}?edit=1` : "/seller/dashboard";

  return (
    <div className="seller-shell-view seller-settings-page">
      <div className="section-head">
        <div>
          <h2>Seller settings</h2>
          <p>Manage storefront presentation, returns, and invoice-ready business details.</p>
        </div>
      </div>

      {loading ? <p className="field-hint">Loading seller settings...</p> : null}
      {error ? <p className="field-hint">{error}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}

      {!loading ? (
        <div className="seller-settings-grid">
          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="settings-storefront"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Invoice and storefront settings</h3>
                <p>
                  Add your public social link and the business details that should appear on
                  order invoices.
                </p>
              </div>
            </div>

            <form className="auth-form seller-settings-form" onSubmit={handleSave}>
              <div className="field-row">
                <label className="field">
                  <span>Legal business name</span>
                  <input
                    type="text"
                    value={legalBusinessName}
                    onChange={(event) => setLegalBusinessName(event.target.value)}
                    placeholder="Registered business name"
                  />
                </label>
                <label className="field">
                  <span>Support email</span>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(event) => setSupportEmail(event.target.value)}
                    placeholder="support@yourstore.com"
                  />
                </label>
              </div>

              <label className="field">
                <span>GST number</span>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(event) => setGstNumber(event.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5"
                />
              </label>
              <p className="field-hint">
                Add GST only if it applies to your current seller setup.
              </p>

              <div className="field-row">
                <label className="field">
                  <span>Business address line</span>
                  <input
                    type="text"
                    value={billingAddress.line1}
                    onChange={(event) =>
                      setBillingAddress((prev) => ({ ...prev, line1: event.target.value }))
                    }
                    placeholder="Registered billing address"
                  />
                </label>
                <label className="field">
                  <span>City</span>
                  <input
                    type="text"
                    value={billingAddress.city}
                    onChange={(event) =>
                      setBillingAddress((prev) => ({ ...prev, city: event.target.value }))
                    }
                    placeholder="City"
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>State</span>
                  <input
                    type="text"
                    value={billingAddress.state}
                    onChange={(event) =>
                      setBillingAddress((prev) => ({ ...prev, state: event.target.value }))
                    }
                    placeholder="State"
                  />
                </label>
                <label className="field">
                  <span>Pincode</span>
                  <input
                    type="text"
                    value={billingAddress.pincode}
                    onChange={(event) =>
                      setBillingAddress((prev) => ({ ...prev, pincode: event.target.value }))
                    }
                    placeholder="Pincode"
                  />
                </label>
              </div>

              <label className="field">
                <span>Instagram profile link</span>
                <input
                  type="url"
                  value={instagramUrl}
                  onChange={(event) => setInstagramUrl(event.target.value)}
                  placeholder="https://www.instagram.com/your_store/"
                />
              </label>
              <p className="field-hint">
                Only profile links are supported. Example: `https://www.instagram.com/your_store/`
              </p>

              <label className="field">
                <span>Return request window (days)</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="1"
                  value={returnWindowDays}
                  onChange={(event) => setReturnWindowDays(event.target.value)}
                  placeholder="7"
                />
              </label>
              <p className="field-hint">
                Customers can request a return only within these days after delivery. Set `0` to disable returns.
              </p>

              <div className="seller-settings-actions">
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save settings"}
                </button>
                <Link className="btn ghost" to={storeEditorPath}>
                  Open store editor
                </Link>
              </div>
            </form>
          </section>

          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="settings-operations"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Operations</h3>
                <p>Open dedicated seller tools for shipping, marketing, reports, and reviews.</p>
              </div>
            </div>

            <div className="seller-dashboard-action-list">
              <div className="seller-dashboard-action-item">
                <span className="seller-dashboard-action-count">01</span>
                <div className="seller-dashboard-action-copy">
                  <strong>Shipping workspace</strong>
                  <p>Pickup rules, courier preferences, and shipment tracking updates.</p>
                </div>
                <Link className="btn ghost" to="/seller/shipping">
                  Open
                </Link>
              </div>
              <div className="seller-dashboard-action-item">
                <span className="seller-dashboard-action-count">02</span>
                <div className="seller-dashboard-action-copy">
                  <strong>Marketing workspace</strong>
                  <p>Coupons, featured products, and promotional banner settings.</p>
                </div>
                <Link className="btn ghost" to="/seller/marketing">
                  Open
                </Link>
              </div>
              <div className="seller-dashboard-action-item">
                <span className="seller-dashboard-action-count">03</span>
                <div className="seller-dashboard-action-copy">
                  <strong>Reports</strong>
                  <p>Revenue, order, customer, product, and tax snapshots.</p>
                </div>
                <Link className="btn ghost" to="/seller/reports">
                  Open
                </Link>
              </div>
              <div className="seller-dashboard-action-item">
                <span className="seller-dashboard-action-count">04</span>
                <div className="seller-dashboard-action-copy">
                  <strong>Reviews</strong>
                  <p>Seller replies, hide/show controls, and admin review flags.</p>
                </div>
                <Link className="btn ghost" to="/seller/reviews">
                  Open
                </Link>
              </div>
            </div>
          </section>

          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="settings-security"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Security and sessions</h3>
                <p>Verify your email and keep an eye on every active login session.</p>
              </div>
            </div>

            <div className="seller-security-stack">
              <div className="seller-security-card">
                <div className="card-head">
                  <h4 className="card-title">Email verification</h4>
                  <span className={`status-pill ${profile?.emailVerified ? "success" : "warning"}`}>
                    {profile?.emailVerified ? "Verified" : "Pending"}
                  </span>
                </div>
                <p className="field-hint">
                  Login email: {profile?.email || "Not available"}
                </p>
                <p className="field-hint">
                  {profile?.emailVerified
                    ? "This email is already verified for seller account security."
                    : "Send a fresh verification link when you need to confirm this email address."}
                </p>
                {!profile?.emailVerified ? (
                  <div className="seller-settings-actions">
                    <button className="btn primary" type="button" onClick={requestVerificationLink}>
                      Send verification link
                    </button>
                    {verificationPreviewPath ? (
                      <Link className="btn ghost" to={verificationPreviewPath}>
                        Open preview link
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="seller-security-card">
                <div className="card-head">
                  <h4 className="card-title">Two-step login</h4>
                  <span className={`status-pill ${securitySettings.loginOtpEnabled ? "success" : "info"}`}>
                    {securitySettings.loginOtpEnabled ? "Email OTP on" : "Email OTP off"}
                  </span>
                </div>
                <p className="field-hint">
                  Add a 6-digit OTP step after password login for this seller account.
                </p>
                <label className="field">
                  <span>Login verification</span>
                  <select
                    value={securitySettings.loginOtpEnabled ? "on" : "off"}
                    onChange={(event) =>
                      setSecuritySettings({
                        loginOtpEnabled: event.target.value === "on",
                      })
                    }
                  >
                    <option value="off">Off</option>
                    <option value="on">Require OTP after password</option>
                  </select>
                </label>
                <p className="field-hint">
                  OTP codes are generated during login and, outside production email delivery,
                  a preview code is shown on the sign-in screen for testing.
                </p>
              </div>

              <div className="seller-security-card">
                <div className="card-head">
                  <h4 className="card-title">Active sessions</h4>
                  <span className="chip">{sessions.length} sessions</span>
                </div>
                {sessionsLoading ? <p className="field-hint">Loading sessions...</p> : null}
                {!sessionsLoading && sessions.length === 0 ? (
                  <p className="field-hint">No active sessions found.</p>
                ) : null}
                <div className="seller-session-list">
                  {sessions.map((session) => (
                    <article key={session.id} className="seller-session-item">
                      <div>
                        <strong>{session.current ? "This device" : "Signed-in device"}</strong>
                        <p className="field-hint">
                          {session.userAgent || "Unknown browser"} · {session.ipAddress || "Unknown IP"}
                        </p>
                        <p className="field-hint">
                          Last used:{" "}
                          {session.lastUsedAt
                            ? new Date(session.lastUsedAt).toLocaleString("en-IN")
                            : "Not available"}
                        </p>
                      </div>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => revokeSession(session.id)}
                        disabled={sessionActionId === session.id}
                      >
                        {sessionActionId === session.id ? "Revoking..." : "Revoke"}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="settings-bank"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Bank and notifications</h3>
                <p>Keep payout details and seller alerts ready for finance follow-ups.</p>
              </div>
            </div>

            <div className="auth-form seller-settings-form">
              <div className="field-row">
                <label className="field">
                  <span>Account holder name</span>
                  <input
                    type="text"
                    value={bankDetails.accountHolderName}
                    onChange={(event) =>
                      setBankDetails((prev) => ({
                        ...prev,
                        accountHolderName: event.target.value,
                      }))
                    }
                    placeholder="Account holder"
                  />
                </label>
                <label className="field">
                  <span>Bank name</span>
                  <input
                    type="text"
                    value={bankDetails.bankName}
                    onChange={(event) =>
                      setBankDetails((prev) => ({ ...prev, bankName: event.target.value }))
                    }
                    placeholder="Bank"
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>Account number</span>
                  <input
                    type="text"
                    value={bankDetails.accountNumber}
                    onChange={(event) =>
                      setBankDetails((prev) => ({
                        ...prev,
                        accountNumber: event.target.value,
                      }))
                    }
                    placeholder="Account number"
                  />
                </label>
                <label className="field">
                  <span>IFSC code</span>
                  <input
                    type="text"
                    value={bankDetails.ifscCode}
                    onChange={(event) =>
                      setBankDetails((prev) => ({
                        ...prev,
                        ifscCode: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="IFSC"
                  />
                </label>
              </div>

              <label className="field">
                <span>UPI ID</span>
                <input
                  type="text"
                  value={bankDetails.upiId}
                  onChange={(event) =>
                    setBankDetails((prev) => ({ ...prev, upiId: event.target.value }))
                  }
                  placeholder="your-upi@bank"
                />
              </label>

              <div className="field-row">
                <label className="field">
                  <span>Order updates</span>
                  <select
                    value={notificationSettings.orderUpdates ? "on" : "off"}
                    onChange={(event) =>
                      setNotificationSettings((prev) => ({
                        ...prev,
                        orderUpdates: event.target.value === "on",
                      }))
                    }
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <label className="field">
                  <span>Customer messages</span>
                  <select
                    value={notificationSettings.customerMessages ? "on" : "off"}
                    onChange={(event) =>
                      setNotificationSettings((prev) => ({
                        ...prev,
                        customerMessages: event.target.value === "on",
                      }))
                    }
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>Payout alerts</span>
                  <select
                    value={notificationSettings.payoutUpdates ? "on" : "off"}
                    onChange={(event) =>
                      setNotificationSettings((prev) => ({
                        ...prev,
                        payoutUpdates: event.target.value === "on",
                      }))
                    }
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <label className="field">
                  <span>Low stock alerts</span>
                  <select
                    value={notificationSettings.lowStockAlerts ? "on" : "off"}
                    onChange={(event) =>
                      setNotificationSettings((prev) => ({
                        ...prev,
                        lowStockAlerts: event.target.value === "on",
                      }))
                    }
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Marketing emails</span>
                <select
                  value={notificationSettings.marketingEmails ? "on" : "off"}
                  onChange={(event) =>
                    setNotificationSettings((prev) => ({
                      ...prev,
                      marketingEmails: event.target.value === "on",
                    }))
                  }
                >
                  <option value="off">Off</option>
                  <option value="on">On</option>
                </select>
              </label>
              <p className="field-hint">Use the main `Save settings` button above to store these finance and alert preferences.</p>
            </div>
          </section>

          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="settings-documents"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Documents and compliance</h3>
                <p>Keep PAN, KYC, GST certificate, and invoice template preferences on file.</p>
              </div>
            </div>

            <div className="auth-form seller-settings-form">
              <div className="field-row">
                <label className="field">
                  <span>PAN number</span>
                  <input
                    type="text"
                    value={documents.panNumber}
                    onChange={(event) =>
                      setDocuments((prev) => ({
                        ...prev,
                        panNumber: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="ABCDE1234F"
                  />
                </label>
                <label className="field">
                  <span>Invoice template</span>
                  <select
                    value={documents.invoiceTemplate}
                    onChange={(event) =>
                      setDocuments((prev) => ({
                        ...prev,
                        invoiceTemplate: event.target.value,
                      }))
                    }
                  >
                    <option value="compact">Compact</option>
                    <option value="classic">Classic</option>
                    <option value="a5">A5</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <span>PAN document URL</span>
                <input
                  type="text"
                  value={documents.panDocumentUrl}
                  onChange={(event) =>
                    setDocuments((prev) => ({ ...prev, panDocumentUrl: event.target.value }))
                  }
                  placeholder="https://..."
                />
              </label>
              <label className="field">
                <span>GST certificate URL</span>
                <input
                  type="text"
                  value={documents.gstCertificateUrl}
                  onChange={(event) =>
                    setDocuments((prev) => ({
                      ...prev,
                      gstCertificateUrl: event.target.value,
                    }))
                  }
                  placeholder="https://..."
                />
              </label>
              <label className="field">
                <span>KYC document URL</span>
                <input
                  type="text"
                  value={documents.kycDocumentUrl}
                  onChange={(event) =>
                    setDocuments((prev) => ({ ...prev, kycDocumentUrl: event.target.value }))
                  }
                  placeholder="https://..."
                />
              </label>
              <label className="field">
                <span>Agreement / policy notes</span>
                <textarea
                  rows="4"
                  value={documents.agreementNotes}
                  onChange={(event) =>
                    setDocuments((prev) => ({ ...prev, agreementNotes: event.target.value }))
                  }
                  placeholder="Internal policy note, acceptance record, or compliance remark."
                />
              </label>
              <p className="field-hint">These compliance details are saved together with the main seller settings form.</p>
            </div>
          </section>

          <section
            className="seller-panel seller-settings-card seller-settings-preview seller-anchor-section"
            id="settings-preview"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Preview</h3>
                <p>This is how the Instagram call-to-action appears on your public store page.</p>
              </div>
            </div>

            <div className="seller-instagram-preview-card">
              <span className="seller-instagram-kicker">Public storefront</span>
              <h4>{profile?.storeName || profile?.name || "Your store"}</h4>
              <p>Invite customers to explore new arrivals, behind-the-scenes craft updates, and reels.</p>
              <p className="field-hint">
                Invoice name: {legalBusinessName.trim() || profile?.storeName || profile?.name || "Not set"}
              </p>
              <p className="field-hint">GST: {gstNumber.trim() || "Not added"}</p>
              <p className="field-hint">
                Billing address:{" "}
                {[billingAddress.line1, billingAddress.city, billingAddress.state, billingAddress.pincode]
                  .filter(Boolean)
                  .join(", ") || "Not added"}
              </p>
              <p className="field-hint">
                Returns accepted within {Number.parseInt(returnWindowDays, 10) || 0} day
                {(Number.parseInt(returnWindowDays, 10) || 0) === 1 ? "" : "s"} of delivery.
              </p>
              {previewUrl ? (
                <a
                  className="seller-store-instagram-btn"
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4.5" y="4.5" width="15" height="15" rx="4.2" />
                    <circle cx="12" cy="12" r="3.4" />
                    <circle cx="17.2" cy="6.8" r="1.05" fill="currentColor" stroke="none" />
                  </svg>
                  Visit Instagram
                </a>
              ) : (
                <p className="field-hint">Add a valid profile link to preview the Instagram button.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
