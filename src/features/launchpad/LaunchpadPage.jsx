import { useEffect, useMemo, useState } from "react";
import "./launchpad-page.css";

const TABS = [
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
  { id: "ended", label: "Ended" },
  { id: "watchlist", label: "Watchlist" },
  { id: "orders", label: "My Participations" },
];

function toCurrency(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function toCompact(value) {
  const numeric = Number(value || 0);
  if (numeric >= 1_000_000_000) {
    return `${(numeric / 1_000_000_000).toFixed(2)}B`;
  }
  if (numeric >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(2)}M`;
  }
  if (numeric >= 1_000) {
    return `${(numeric / 1_000).toFixed(2)}K`;
  }
  return numeric.toFixed(2);
}

function formatCountdown(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getPhaseMeta(launch) {
  if (!launch) {
    return { label: "Unknown", className: "is-upcoming", countdownLabel: "Starts in", countdownValue: "--:--:--" };
  }

  if (launch.phase === "live") {
    return {
      label: "Live",
      className: "is-live",
      countdownLabel: "Ends in",
      countdownValue: formatCountdown(launch.endsInSeconds),
    };
  }

  if (launch.phase === "upcoming") {
    return {
      label: "Upcoming",
      className: "is-upcoming",
      countdownLabel: "Starts in",
      countdownValue: formatCountdown(launch.startsInSeconds),
    };
  }

  return {
    label: launch.phase === "released" ? "Trading Open" : "Ended",
    className: launch.phase === "released" ? "is-released" : "is-ended",
    countdownLabel: "Trading opens in",
    countdownValue: formatCountdown(launch.tradingOpensInSeconds),
  };
}

function LaunchpadLaunchItem({ launch, isSelected, onSelect, onWatchlistToggle }) {
  const meta = getPhaseMeta(launch);
  const livePrice = Number(launch.currentTierPriceUsd || launch.launchPriceUsd || 0);

  return (
    <button type="button" className={`launchpad-launch-item ${isSelected ? "is-selected" : ""}`} onClick={onSelect}>
      <div className="launchpad-launch-item-head">
        <div>
          <strong>{launch.coinSymbol}</strong>
          <p className="launchpad-launch-subtitle">{launch.coinName}</p>
        </div>
        <span className={`launchpad-chip ${meta.className}`}>{meta.label}</span>
      </div>
      <div className="launchpad-launch-price-row">
        <small>Tier Price</small>
        <strong>${toCurrency(livePrice)}</strong>
      </div>
      <div className="launchpad-launch-item-metrics">
        <span>Hype {Number(launch.hypePercent || 0).toFixed(0)}%</span>
        <span>Sold {Number(launch.soldPercent || 0).toFixed(2)}%</span>
        <span>ROI {Number(launch.expectedRoiX || 0).toFixed(2)}x</span>
      </div>
      <div className="launchpad-launch-item-foot">
        <small>{meta.countdownLabel}: {meta.countdownValue}</small>
        <button
          type="button"
          className={`launchpad-watch-btn ${launch.isWatchlisted ? "is-active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onWatchlistToggle(launch);
          }}
        >
          <i className={`fas ${launch.isWatchlisted ? "fa-star" : "fa-star-half-stroke"}`} />
        </button>
      </div>
    </button>
  );
}

export default function LaunchpadPage({
  user,
  onBack,
  onCatalog,
  onDetail,
  onWatchlistToggle,
  onBuyPreview,
  onBuySubmit,
  onMyOrders,
  onFeed,
  onCountdown,
  onNavigateTrade,
}) {
  const [activeTab, setActiveTab] = useState("live");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [selectedLaunchId, setSelectedLaunchId] = useState(0);
  const [detail, setDetail] = useState(null);
  const [feed, setFeed] = useState([]);
  const [orders, setOrders] = useState([]);
  const [buyAmount, setBuyAmount] = useState("");
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshingDetail, setRefreshingDetail] = useState(false);

  const launchById = useMemo(() => {
    const map = new Map();
    catalog.forEach((item) => map.set(Number(item.launchId), item));
    return map;
  }, [catalog]);

  const selectedLaunch = useMemo(() => {
    if (detail?.launch?.launchId && Number(detail.launch.launchId) === Number(selectedLaunchId)) {
      return detail.launch;
    }
    return launchById.get(Number(selectedLaunchId)) || null;
  }, [detail, launchById, selectedLaunchId]);

  const launchesByTab = useMemo(() => {
    const grouped = {
      live: [],
      upcoming: [],
      ended: [],
    };

    catalog.forEach((item) => {
      if (item.phase === "live") {
        grouped.live.push(item);
      } else if (item.phase === "upcoming") {
        grouped.upcoming.push(item);
      } else {
        grouped.ended.push(item);
      }
    });

    return grouped;
  }, [catalog]);

  const currentList = useMemo(() => {
    if (activeTab === "watchlist") {
      return watchlist;
    }
    if (activeTab === "orders") {
      return [];
    }
    return launchesByTab[activeTab] || [];
  }, [activeTab, launchesByTab, watchlist]);

  const loadCatalog = async ({ keepLoader = false } = {}) => {
    if (!onCatalog) {
      return;
    }

    if (!keepLoader) {
      setLoading(true);
    }

    try {
      const payload = await onCatalog({ status: "all", page: 1, limit: 80 });
      const launches = Array.isArray(payload?.launches) ? payload.launches : [];
      const nextWatchlist = Array.isArray(payload?.watchlist) ? payload.watchlist : [];
      setCatalog(launches);
      setWatchlist(nextWatchlist);

      if (!selectedLaunchId && launches.length) {
        const preferred = launches.find((item) => item.phase === "live") || launches[0];
        setSelectedLaunchId(Number(preferred.launchId));
      }

      if (selectedLaunchId && !launches.find((item) => Number(item.launchId) === Number(selectedLaunchId))) {
        const preferred = launches.find((item) => item.phase === "live") || launches[0] || null;
        setSelectedLaunchId(preferred ? Number(preferred.launchId) : 0);
      }

      setError("");
    } catch (err) {
      setError(err?.message || "Could not load launchpad catalog.");
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    if (!onMyOrders) {
      return;
    }
    try {
      const payload = await onMyOrders({ page: 1, limit: 50 });
      setOrders(Array.isArray(payload?.orders) ? payload.orders : []);
    } catch {
      setOrders([]);
    }
  };

  const loadDetail = async (launchId) => {
    if (!launchId || !onDetail) {
      return;
    }

    setRefreshingDetail(true);
    try {
      const payload = await onDetail({ launchId, feedLimit: 20 });
      setDetail(payload || null);
      setFeed(Array.isArray(payload?.feed) ? payload.feed : []);
    } catch (err) {
      setError(err?.message || "Could not load launch detail.");
    } finally {
      setRefreshingDetail(false);
    }
  };

  useEffect(() => {
    loadCatalog();
    loadOrders();
  }, []);

  useEffect(() => {
    if (!selectedLaunchId) {
      return;
    }
    loadDetail(selectedLaunchId);
  }, [selectedLaunchId]);

  useEffect(() => {
    if (!selectedLaunchId || !onFeed || !onCountdown) {
      return undefined;
    }

    let mounted = true;
    const tick = async () => {
      try {
        const [feedPayload, countdownPayload] = await Promise.all([
          onFeed({ launchId: selectedLaunchId, limit: 25 }),
          onCountdown({ launchId: selectedLaunchId }),
        ]);

        if (!mounted) {
          return;
        }

        if (Array.isArray(feedPayload?.feed)) {
          setFeed(feedPayload.feed);
        }

        if (countdownPayload?.launch) {
          setDetail((prev) => ({
            ...(prev || {}),
            launch: countdownPayload.launch,
            countdown: countdownPayload.countdown || prev?.countdown,
          }));
        }
      } catch {
        // Keep stale data silently.
      }
    };

    const timer = window.setInterval(tick, 12000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [selectedLaunchId, onFeed, onCountdown]);

  useEffect(() => {
    if (!onCatalog) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      loadCatalog({ keepLoader: true });
    }, 30000);

    return () => window.clearInterval(timer);
  }, [onCatalog, selectedLaunchId]);

  const handleWatchlistToggle = async (launch) => {
    if (!onWatchlistToggle || !launch) {
      return;
    }
    try {
      await onWatchlistToggle({ launchId: launch.launchId });
      await loadCatalog({ keepLoader: true });
      if (selectedLaunchId === launch.launchId) {
        await loadDetail(launch.launchId);
      }
    } catch (err) {
      setError(err?.message || "Could not update watchlist.");
    }
  };

  const handlePreview = async () => {
    setNotice("");
    setPreview(null);

    if (!selectedLaunchId) {
      setError("Please select a launch first.");
      return;
    }

    const amount = Number(buyAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid USD amount.");
      return;
    }

    try {
      const payload = await onBuyPreview({ launchId: selectedLaunchId, buyUsd: amount });
      setPreview(payload?.preview || null);
      setError("");
    } catch (err) {
      setError(err?.message || "Could not preview buy.");
    }
  };

  const handleBuySubmit = async () => {
    if (!selectedLaunchId) {
      setError("Please select a launch first.");
      return;
    }

    const amount = Number(buyAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid USD amount.");
      return;
    }

    setSubmitting(true);
    setNotice("");

    try {
      const payload = await onBuySubmit({ launchId: selectedLaunchId, buyUsd: amount });
      setNotice(payload?.message || "Launch buy completed.");
      setBuyAmount("");
      setPreview(null);
      await Promise.all([loadCatalog({ keepLoader: true }), loadDetail(selectedLaunchId), loadOrders()]);
      setError("");
    } catch (err) {
      setError(err?.message || "Could not submit buy order.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMeta = getPhaseMeta(selectedLaunch);
  const featured = launchesByTab.live[0] || launchesByTab.upcoming[0] || launchesByTab.ended[0] || null;
  const launchpadStats = useMemo(() => {
    const totalWatchers = catalog.reduce((acc, item) => acc + Number(item.watchlistCount || 0), 0);
    return {
      live: launchesByTab.live.length,
      upcoming: launchesByTab.upcoming.length,
      ended: launchesByTab.ended.length,
      watchers: totalWatchers,
      watchlistedByMe: watchlist.length,
    };
  }, [catalog, launchesByTab, watchlist.length]);

  return (
    <main className="launchpad-shell">
      <header className="launchpad-header">
        <button type="button" className="launchpad-back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left" />
        </button>
        <div>
          <p>Initial Coin Offer</p>
          <h1>Launchpad</h1>
        </div>
        <span className="launchpad-user-pill">ID {user?.userId || "------"}</span>
      </header>

      {featured ? (
        <section className="launchpad-hero">
          <div className="launchpad-hero-title-wrap">
            <small>Featured Launch</small>
            <h2>{featured.coinSymbol} Launch</h2>
            <p>{featured.coinName}</p>
            <div className="launchpad-hero-tags">
              <span>{featured.phase === "live" ? "Live Right Now" : "Next Big Launch"}</span>
              <span>{Number(featured.soldPercent || 0).toFixed(2)}% Sold</span>
            </div>
          </div>
          <div className="launchpad-hero-stats">
            <span>
              <small>Hype</small>
              <strong>{Number(featured.hypePercent || 0).toFixed(0)}%</strong>
            </span>
            <span>
              <small>Watchlist</small>
              <strong>{toCompact(featured.watchlistCount || 0)}</strong>
            </span>
            <span>
              <small>Expected ROI</small>
              <strong>{Number(featured.expectedRoiX || 0).toFixed(2)}x</strong>
            </span>
          </div>
        </section>
      ) : null}

      <section className="launchpad-overview-strip">
        <article>
          <small>Live Launches</small>
          <strong>{launchpadStats.live}</strong>
        </article>
        <article>
          <small>Upcoming</small>
          <strong>{launchpadStats.upcoming}</strong>
        </article>
        <article>
          <small>My Watchlist</small>
          <strong>{launchpadStats.watchlistedByMe}</strong>
        </article>
        <article>
          <small>Total Watchers</small>
          <strong>{toCompact(launchpadStats.watchers)}</strong>
        </article>
      </section>

      <section className="launchpad-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </section>

      {notice ? <p className="launchpad-notice">{notice}</p> : null}
      {error ? <p className="launchpad-error">{error}</p> : null}

      {loading ? <p className="launchpad-loading">Loading launchpad data...</p> : null}

      {!loading && activeTab !== "orders" ? (
        <section className="launchpad-grid">
          <aside className="launchpad-list-panel">
            <header>
              <h3>{activeTab === "watchlist" ? "Watchlist" : `${activeTab[0].toUpperCase()}${activeTab.slice(1)} Launches`}</h3>
              <small>{currentList.length} found</small>
            </header>

            <div className="launchpad-list-scroll">
              {currentList.length ? (
                currentList.map((launch) => (
                  <LaunchpadLaunchItem
                    key={launch.launchId}
                    launch={launch}
                    isSelected={Number(selectedLaunchId) === Number(launch.launchId)}
                    onSelect={() => setSelectedLaunchId(Number(launch.launchId))}
                    onWatchlistToggle={handleWatchlistToggle}
                  />
                ))
              ) : (
                <p className="launchpad-empty">No launch available in this section yet.</p>
              )}
            </div>
          </aside>

          <section className="launchpad-detail-panel">
            {!selectedLaunch ? (
              <p className="launchpad-empty">Select a launch to view details.</p>
            ) : (
              <>
                <header className="launchpad-detail-head">
                  <div>
                    <h2>{selectedLaunch.coinSymbol}</h2>
                    <p>{selectedLaunch.coinName}</p>
                  </div>
                  <span className={`launchpad-chip ${selectedMeta.className}`}>{selectedMeta.label}</span>
                </header>

                <div className="launchpad-countdown-row">
                  <article>
                    <small>{selectedMeta.countdownLabel}</small>
                    <strong>{selectedMeta.countdownValue}</strong>
                  </article>
                  <article>
                    <small>Trading opens in</small>
                    <strong>{formatCountdown(selectedLaunch.tradingOpensInSeconds)}</strong>
                  </article>
                  <article>
                    <small>Current tier price</small>
                    <strong>${toCurrency(selectedLaunch.currentTierPriceUsd || selectedLaunch.launchPriceUsd)}</strong>
                  </article>
                </div>

                <div className="launchpad-kpi-row">
                  <article>
                    <small>Community Hype</small>
                    <strong>{Number(selectedLaunch.hypePercent || 0).toFixed(0)}%</strong>
                  </article>
                  <article>
                    <small>Watchlisted By</small>
                    <strong>{toCompact(selectedLaunch.watchlistCount || 0)} users</strong>
                  </article>
                  <article>
                    <small>Expected ROI</small>
                    <strong>{Number(selectedLaunch.expectedRoiX || 0).toFixed(2)}x</strong>
                  </article>
                  <article>
                    <small>Slots</small>
                    <strong>{Number(selectedLaunch.maxSlots || 0) > 0 ? `${selectedLaunch.maxSlots} Max` : "Unlimited"}</strong>
                  </article>
                </div>

                <div className="launchpad-progress-wrap">
                  <div className="launchpad-progress-head">
                    <small>Sold {selectedLaunch.soldPercent.toFixed(2)}%</small>
                    <small>{selectedLaunch.scarcityLabel}</small>
                  </div>
                  <div className="launchpad-progress-bar">
                    <span style={{ width: `${Math.min(100, selectedLaunch.soldPercent)}%` }} />
                  </div>
                  <p>
                    {toCompact(selectedLaunch.soldTokens)} / {toCompact(selectedLaunch.tokensForSale)} {selectedLaunch.coinSymbol}
                  </p>
                </div>

                <div className="launchpad-tier-grid">
                  {(selectedLaunch.tiers || []).map((tier) => (
                    <article key={tier.tierId || `${tier.minSoldPercent}-${tier.maxSoldPercent}`}>
                      <small>{tier.minSoldPercent}% - {tier.maxSoldPercent}%</small>
                      <strong>${toCurrency(tier.priceUsd)}</strong>
                    </article>
                  ))}
                </div>

                <section className="launchpad-buy-card">
                  <h3>Buy {selectedLaunch.coinSymbol}</h3>
                  <div className="launchpad-buy-input-row">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={buyAmount}
                      onChange={(event) => setBuyAmount(event.target.value)}
                      placeholder="Enter amount in USD"
                    />
                    <button type="button" onClick={handlePreview}>Preview</button>
                    <button type="button" className="is-primary" onClick={handleBuySubmit} disabled={submitting}>
                      {submitting ? "Submitting..." : "Buy Now"}
                    </button>
                  </div>
                  <small>Funding wallet: SPOT_USDT</small>

                  {preview ? (
                    <div className="launchpad-preview-grid">
                      <span><small>You pay</small><strong>${toCurrency(preview.buyUsd)}</strong></span>
                      <span><small>You receive</small><strong>{toCompact(preview.allocationTokens)} {selectedLaunch.coinSymbol}</strong></span>
                      <span><small>Tier price</small><strong>${toCurrency(preview.tierPriceUsd)}</strong></span>
                      <span><small>Expected profit</small><strong>${toCurrency(preview.expectedProfitUsd)}</strong></span>
                    </div>
                  ) : null}
                </section>

                <section className="launchpad-feed-card">
                  <header>
                    <h3>Live Feed</h3>
                    <small>{refreshingDetail ? "Syncing..." : "Realtime"}</small>
                  </header>
                  <div className="launchpad-feed-list">
                    {feed.length ? (
                      feed.map((event) => (
                        <article key={event.eventId} className={event.isSimulated ? "is-simulated" : ""}>
                          <p>{event.message}</p>
                          <small>
                            <span className={`launchpad-feed-type ${event.isSimulated ? "is-simulated" : "is-real"}`}>
                              {event.isSimulated ? "Market Pulse" : "Verified Trade"}
                            </span>
                            {" • "}
                            {new Date(event.createdAt).toLocaleTimeString()}
                          </small>
                        </article>
                      ))
                    ) : (
                      <p className="launchpad-empty">No feed events yet.</p>
                    )}
                  </div>
                </section>

                {selectedLaunch.phase === "released" || (selectedLaunch.tradingOpensInSeconds <= 0 && ["ended", "sold_out"].includes(selectedLaunch.phase)) ? (
                  <button type="button" className="launchpad-trade-now" onClick={() => onNavigateTrade?.("transaction")}>
                    Trade Now
                  </button>
                ) : null}
              </>
            )}
          </section>
        </section>
      ) : null}

      {!loading && activeTab === "orders" ? (
        <section className="launchpad-orders-card">
          <header>
            <h3>My Participations</h3>
            <small>{orders.length} orders</small>
          </header>

          {orders.length ? (
            <div className="launchpad-orders-list">
              {orders.map((order) => (
                <article key={order.participationRef}>
                  <div>
                    <strong>{order.coinSymbol}</strong>
                    <small>{new Date(order.createdAt).toLocaleString()}</small>
                  </div>
                  <div>
                    <span>${toCurrency(order.buyUsd)}</span>
                    <small>{toCompact(order.allocationTokens)} tokens</small>
                  </div>
                  <div>
                    <span className={`launchpad-chip ${order.status === "released" ? "is-released" : "is-upcoming"}`}>{order.status}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="launchpad-empty">No participations yet.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
