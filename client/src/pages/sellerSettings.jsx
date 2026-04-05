import { useCallback, useEffect, useState } from "react";
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
  const [securitySettings, setSecuritySettings] = useState({
    loginOtpEnabled: false,
  });
  const [documents, setDocuments] = useState({
    panNumber: "",
    panDocumentUrl: "",
    gstCertificateUrl: "",
    kycDocumentUrl: "",
    agreementNotes: "",
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
      setSecuritySettings({
        loginOtpEnabled: Boolean(data?.sellerSecuritySettings?.loginOtpEnabled),
      });
      setDocuments({
        panNumber: String(data?.sellerDocuments?.panNumber || "").trim(),
        panDocumentUrl: String(data?.sellerDocuments?.panDocumentUrl || "").trim(),
        gstCertificateUrl: String(data?.sellerDocuments?.gstCertificateUrl || "").trim(),
        kycDocumentUrl: String(data?.sellerDocuments?.kycDocumentUrl || "").trim(),
        agreementNotes: String(data?.sellerDocuments?.agreementNotes || "").trim(),
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
          sellerSecuritySettings: securitySettings,
          sellerDocuments: {
            panNumber: documents.panNumber.trim().toUpperCase(),
            panDocumentUrl: documents.panDocumentUrl.trim(),
            gstCertificateUrl: documents.gstCertificateUrl.trim(),
            kycDocumentUrl: documents.kycDocumentUrl.trim(),
            agreementNotes: documents.agreementNotes.trim(),
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

  return (
    <div className="seller-shell-view seller-settings-page">
      <div className="section-head">
        <div>
          <h2>Seller settings</h2>
          <p>Manage business details, payouts, account security, and compliance records.</p>
        </div>
      </div>

      {loading ? <p className="field-hint">Loading seller settings...</p> : null}
      {error ? <p className="field-hint">{error}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}

      {!loading ? (
        <form className="seller-settings-shell" onSubmit={handleSave}>
          <div className="seller-settings-grid">
          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="settings-business"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Business details</h3>
                <p>Keep invoice-ready business identity, billing address, and return rules together.</p>
              </div>
            </div>

            <div className="auth-form seller-settings-form">
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

            </div>
          </section>

          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="settings-security"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Security</h3>
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
            id="settings-payouts"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Payout details</h3>
                <p>Store the bank account or UPI destination used when payouts are released.</p>
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
            </div>
          </section>

          <section
            className="seller-panel seller-settings-card seller-anchor-section"
            id="settings-documents"
          >
            <div className="seller-panel-head">
              <div>
                <h3>Compliance</h3>
                <p>Save PAN, GST, KYC, and internal compliance notes for future review.</p>
              </div>
            </div>

            <div className="auth-form seller-settings-form">
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
            </div>
          </section>

          </div>

          <div className="seller-settings-footer">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
