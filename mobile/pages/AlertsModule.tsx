import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { GlassContainer, GlassView } from "expo-glass-effect";
import {
  sortAlerts,
  urgencyLabel,
  URGENCY_LEVELS,
  type AlertAudience,
  type AlertComment,
  type AlertUrgency,
  type CampusAlert,
} from "../lib/alerts";
import {
  alertVisibleToRole,
  feedAudiencesForRole,
  markAlertsSeen,
} from "../lib/alertsUnread";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/config";
import { canUseLiquidGlass, GlassCircleButton } from "../lib/glass";
import { canApproveAlerts, canComposeAlerts } from "../lib/roles";

function urgencyTrackColor(level: AlertUrgency): string {
  switch (level) {
    case "critical":
      return "#c62828";
    case "high":
      return "#c88800";
    default:
      return "#1565C0";
  }
}

const AUDIENCE_LABEL: Record<AlertAudience, string> = {
  all: "Everyone",
  staff: "Staff",
};

type Props = {
  /** Clears the tab bar so the list and FAB stay on screen. */
  bottomInset: number;
  /** True while the Alerts tab is visible — clears the unread badge. */
  active?: boolean;
};

type PickerTarget = "effective" | "expires";

// MVP: staff (faculty + driver + admin readers) or everyone with an account — not visitors.
const AUDIENCES: { id: AlertAudience; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "staff", label: "Staff" },
];

const ALERT_COLS =
  "id, title, body, audience, status, urgency, effective_at, expires_at, active, created_at";

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Live campus alerts + compose + admin approval queue + comment threads. */
export function AlertsModule({ bottomInset, active = true }: Props) {
  const { role, session } = useAuth();
  const canCompose = canComposeAlerts(role);
  const canApprove = canApproveAlerts(role);
  const postsLive = canApprove;

  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<CampusAlert[]>([]);
  const [pending, setPending] = useState<CampusAlert[]>([]);
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const [writing, setWriting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fabHeight, setFabHeight] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AlertAudience>("all");
  const [urgency, setUrgency] = useState<AlertUrgency>("normal");
  // Separate from urgency so the native slider isn't re-controlled on every drag tick
  // (iOS 26 Liquid Glass UISlider fights React if value updates mid-slide).
  const [urgencyIndex, setUrgencyIndex] = useState(0);
  const [urgencyDragging, setUrgencyDragging] = useState(false);
  const [effectiveAt, setEffectiveAt] = useState(() => new Date());
  const [expiresAt, setExpiresAt] = useState(() => addHours(new Date(), 24));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerMode, setPickerMode] = useState<"date" | "time" | "datetime">(
    "date",
  );

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured on this build.");
      setAlerts([]);
      setPending([]);
      setReady(true);
      return;
    }

    // Audience filter is also enforced by RLS; this keeps the feed honest if
    // a role/session is stale or a row briefly appears via Realtime.
    let feedQuery = supabase
      .from("alerts")
      .select(ALERT_COLS)
      .eq("status", "approved")
      .eq("active", true)
      .gt("expires_at", new Date().toISOString());

    const audiences = feedAudiencesForRole(role);
    if (audiences) {
      feedQuery = feedQuery.in("audience", audiences);
    }

    const pendingQuery = canApprove
      ? supabase
          .from("alerts")
          .select(ALERT_COLS)
          .eq("status", "pending")
          .eq("active", true)
      : null;

    const [feedResult, pendingResult] = await Promise.all([
      feedQuery,
      pendingQuery ?? Promise.resolve({ data: [], error: null }),
    ]);

    if (feedResult.error) {
      setError(feedResult.error.message);
      setAlerts([]);
    } else {
      setError(null);
      const rows = ((feedResult.data as CampusAlert[]) ?? []).filter((row) =>
        alertVisibleToRole(row.audience, role),
      );
      setAlerts(sortAlerts(rows));
    }

    if (pendingResult.error) {
      setPending([]);
    } else {
      setPending(sortAlerts((pendingResult.data as CampusAlert[]) ?? []));
    }
    setReady(true);
  }, [canApprove, role]);

  useEffect(() => {
    void load();
  }, [load]);

  // Opening Alerts clears the tab unread badge.
  useEffect(() => {
    if (!active) return;
    void markAlertsSeen();
  }, [active, alerts]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel("alerts_feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function review(item: CampusAlert, decision: "approved" | "rejected") {
    if (!supabase || !session?.user?.id) return;
    setReviewingId(item.id);
    const { error: updateError } = await supabase
      .from("alerts")
      .update({
        status: decision,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("status", "pending");
    setReviewingId(null);
    if (updateError) {
      Alert.alert("Couldn't update alert", updateError.message);
      return;
    }
    await load();
  }

  function confirmReject(item: CampusAlert) {
    Alert.alert("Reject alert", `Reject “${item.title}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: () => void review(item, "rejected"),
      },
    ]);
  }

  function openNew() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setAudience("all");
    setUrgency("normal");
    setUrgencyIndex(0);
    setUrgencyDragging(false);
    const now = new Date();
    setEffectiveAt(now);
    setExpiresAt(addHours(now, 24));
    setFormError(null);
    setNotice(null);
    setPickerTarget(null);
    setSendMenuOpen(false);
    setScheduling(false);
    setWriting(true);
  }

  function openEdit(item: CampusAlert) {
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setAudience(item.audience === "staff" ? "staff" : "all");
    const level = item.urgency ?? "normal";
    setUrgency(level);
    setUrgencyIndex(Math.max(0, URGENCY_LEVELS.indexOf(level)));
    setUrgencyDragging(false);
    setEffectiveAt(new Date(item.effective_at));
    setExpiresAt(new Date(item.expires_at));
    setFormError(null);
    setNotice(null);
    setPickerTarget(null);
    setSendMenuOpen(false);
    setScheduling(false);
    setWriting(true);
  }

  function snapUrgency(raw: number) {
    const index = Math.max(
      0,
      Math.min(URGENCY_LEVELS.length - 1, Math.round(raw)),
    );
    setUrgencyIndex(index);
    setUrgency(URGENCY_LEVELS[index]!);
  }

  function closeWriter() {
    setWriting(false);
    setEditingId(null);
    setFormError(null);
    setSaving(false);
    setPickerTarget(null);
    setSendMenuOpen(false);
    setScheduling(false);
  }

  function openAdminMenu(item: CampusAlert) {
    Alert.alert(item.title, undefined, [
      { text: "Edit", onPress: () => openEdit(item) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDelete(item),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function confirmDelete(item: CampusAlert) {
    Alert.alert("Delete alert", `Remove “${item.title}” from the feed?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void deleteAlert(item),
      },
    ]);
  }

  async function deleteAlert(item: CampusAlert) {
    if (!supabase) return;
    // Soft pull-down — keeps the row for audit, hides it from the feed.
    const { error: deleteError } = await supabase
      .from("alerts")
      .update({ active: false })
      .eq("id", item.id);
    if (deleteError) {
      Alert.alert("Couldn't delete alert", deleteError.message);
      return;
    }
    await load();
  }

  function pickEffective(next: Date) {
    setEffectiveAt(next);
    setExpiresAt((current) =>
      current.getTime() > next.getTime() ? current : addHours(next, 24),
    );
  }

  /** Android only — iOS uses the compact dropdown inline. */
  function openCalendar(target: PickerTarget) {
    setPickerTarget(target);
    setPickerMode("date");
  }

  function onAndroidPickerChange(
    event: DateTimePickerEvent,
    selected?: Date,
  ) {
    if (!pickerTarget) return;
    if (event.type === "dismissed") {
      setPickerTarget(null);
      return;
    }

    const base = pickerTarget === "effective" ? effectiveAt : expiresAt;
    const next = selected ? new Date(selected) : new Date(base);

    if (pickerMode === "date") {
      const merged = new Date(base);
      merged.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
      if (pickerTarget === "effective") pickEffective(merged);
      else setExpiresAt(merged);
      setPickerMode("time");
      return;
    }

    const merged = new Date(base);
    merged.setHours(next.getHours(), next.getMinutes(), 0, 0);
    if (pickerTarget === "effective") pickEffective(merged);
    else setExpiresAt(merged);
    setPickerTarget(null);
  }

  async function save(sendAt: Date) {
    const nextTitle = title.trim();
    const nextBody = body.trim();
    if (!nextTitle || !nextBody || !supabase || !session?.user?.id) return;

    // Keep expiry after the chosen send time (same rule as the DB check).
    let expiry = expiresAt;
    if (!(expiry.getTime() > sendAt.getTime())) {
      expiry = addHours(sendAt, 24);
      setExpiresAt(expiry);
    }

    setSaving(true);
    setFormError(null);
    setSendMenuOpen(false);
    setScheduling(false);

    if (editingId != null) {
      const { error: updateError } = await supabase
        .from("alerts")
        .update({
          title: nextTitle,
          body: nextBody,
          audience,
          urgency,
          effective_at: sendAt.toISOString(),
          expires_at: expiry.toISOString(),
        })
        .eq("id", editingId);
      setSaving(false);
      if (updateError) {
        setFormError(updateError.message);
        return;
      }
      closeWriter();
      void load();
      return;
    }

    const userId = session.user.id;
    const row = postsLive
      ? {
          title: nextTitle,
          body: nextBody,
          audience,
          urgency,
          status: "approved" as const,
          effective_at: sendAt.toISOString(),
          expires_at: expiry.toISOString(),
          active: true,
          created_by: userId,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        }
      : {
          title: nextTitle,
          body: nextBody,
          audience,
          urgency,
          status: "pending" as const,
          effective_at: sendAt.toISOString(),
          expires_at: expiry.toISOString(),
          active: true,
          created_by: userId,
          reviewed_by: null,
          reviewed_at: null,
        };

    const { error: insertError } = await supabase.from("alerts").insert(row);
    setSaving(false);

    if (insertError) {
      setFormError(insertError.message);
      return;
    }

    closeWriter();
    if (postsLive) {
      setNotice(null);
      void load();
    } else {
      setNotice("Submitted for admin approval.");
    }
  }

  if (writing) {
    const canSubmit =
      title.trim().length > 0 && body.trim().length > 0 && !saving;
    const androidPickerValue =
      pickerTarget === "expires" ? expiresAt : effectiveAt;
    const sendIconColor = canSubmit ? "#1565C0" : "#9bb";
    const liquidGlass = canUseLiquidGlass();

    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <GlassCircleButton
            onPress={closeWriter}
            disabled={saving}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color="#333" />
          </GlassCircleButton>
          <Text style={styles.headerTitle}>
            {editingId != null ? "Edit alert" : "New alert"}
          </Text>
          {saving ? (
            <ActivityIndicator color="#1565C0" />
          ) : editingId != null ? (
            <GlassCircleButton
              onPress={() => void save(effectiveAt)}
              disabled={!canSubmit}
              accessibilityLabel="Save alert"
            >
              <Ionicons name="checkmark" size={22} color={sendIconColor} />
            </GlassCircleButton>
          ) : (
            <View style={styles.headerActions}>
              <GlassCircleButton
                onPress={() => void save(new Date())}
                disabled={!canSubmit}
                accessibilityLabel={postsLive ? "Post now" : "Submit now"}
              >
                <Ionicons name="send" size={18} color={sendIconColor} />
              </GlassCircleButton>
              <GlassCircleButton
                onPress={() => {
                  if (!canSubmit) return;
                  setSendMenuOpen((open) => {
                    if (open) setScheduling(false);
                    return !open;
                  });
                }}
                disabled={!canSubmit}
                accessibilityLabel="More send options"
              >
                <Ionicons name="chevron-down" size={18} color={sendIconColor} />
              </GlassCircleButton>
            </View>
          )}
        </View>

        {sendMenuOpen ? (
          <View style={styles.sendMenuAnchor} pointerEvents="box-none">
            {!scheduling ? (
              liquidGlass ? (
                <GlassContainer spacing={8} style={styles.sendMenuGlassStack}>
                  <GlassView
                    style={styles.sendMenuGlassRow}
                    glassEffectStyle="regular"
                    isInteractive
                  >
                    <Pressable
                      style={styles.sendMenuRow}
                      onPress={() => void save(new Date())}
                    >
                      <Ionicons name="send-outline" size={18} color="#222" />
                      <Text style={styles.sendMenuText}>Send now</Text>
                    </Pressable>
                  </GlassView>
                  <GlassView
                    style={styles.sendMenuGlassRow}
                    glassEffectStyle="regular"
                    isInteractive
                  >
                    <Pressable
                      style={styles.sendMenuRow}
                      onPress={() => {
                        pickEffective(
                          effectiveAt.getTime() > Date.now()
                            ? effectiveAt
                            : addHours(new Date(), 1),
                        );
                        setScheduling(true);
                      }}
                    >
                      <Ionicons name="time-outline" size={18} color="#222" />
                      <Text style={styles.sendMenuText}>Schedule send</Text>
                    </Pressable>
                  </GlassView>
                </GlassContainer>
              ) : (
                <View style={styles.sendMenu}>
                  <Pressable
                    style={styles.sendMenuRow}
                    onPress={() => void save(new Date())}
                  >
                    <Ionicons name="send-outline" size={18} color="#222" />
                    <Text style={styles.sendMenuText}>Send now</Text>
                  </Pressable>
                  <Pressable
                    style={styles.sendMenuRow}
                    onPress={() => {
                      pickEffective(
                        effectiveAt.getTime() > Date.now()
                          ? effectiveAt
                          : addHours(new Date(), 1),
                      );
                      setScheduling(true);
                    }}
                  >
                    <Ionicons name="time-outline" size={18} color="#222" />
                    <Text style={styles.sendMenuText}>Schedule send</Text>
                  </Pressable>
                </View>
              )
            ) : liquidGlass ? (
              <GlassView
                style={styles.schedulePanelGlass}
                glassEffectStyle="regular"
                isInteractive
              >
                <View style={styles.schedulePanel}>
                  <Text style={styles.scheduleLabel}>Send at</Text>
                  {Platform.OS === "ios" ? (
                    <DateTimePicker
                      value={effectiveAt}
                      mode="datetime"
                      display="compact"
                      minimumDate={new Date()}
                      onChange={(_event, date) => {
                        if (date) pickEffective(date);
                      }}
                    />
                  ) : (
                    <Pressable
                      style={styles.dateBtn}
                      onPress={() => openCalendar("effective")}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color="#1565C0"
                      />
                      <Text style={styles.dateBtnText}>
                        {formatWhen(effectiveAt.toISOString())}
                      </Text>
                    </Pressable>
                  )}
                  <View style={styles.scheduleActions}>
                    <Pressable
                      onPress={() => setScheduling(false)}
                      hitSlop={8}
                    >
                      <Text style={styles.link}>Back</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void save(effectiveAt)}
                      hitSlop={8}
                    >
                      <Text style={styles.link}>
                        {postsLive ? "Schedule" : "Schedule submit"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </GlassView>
            ) : (
              <View style={[styles.sendMenu, styles.schedulePanel]}>
                <Text style={styles.scheduleLabel}>Send at</Text>
                {Platform.OS === "ios" ? (
                  <DateTimePicker
                    value={effectiveAt}
                    mode="datetime"
                    display="compact"
                    minimumDate={new Date()}
                    onChange={(_event, date) => {
                      if (date) pickEffective(date);
                    }}
                  />
                ) : (
                  <Pressable
                    style={styles.dateBtn}
                    onPress={() => openCalendar("effective")}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color="#1565C0"
                    />
                    <Text style={styles.dateBtnText}>
                      {formatWhen(effectiveAt.toISOString())}
                    </Text>
                  </Pressable>
                )}
                <View style={styles.scheduleActions}>
                  <Pressable
                    onPress={() => setScheduling(false)}
                    hitSlop={8}
                  >
                    <Text style={styles.link}>Back</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void save(effectiveAt)}
                    hitSlop={8}
                  >
                    <Text style={styles.link}>
                      {postsLive ? "Schedule" : "Schedule submit"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={[
            styles.form,
            { paddingBottom: bottomInset + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => {
            setSendMenuOpen(false);
            setScheduling(false);
          }}
        >
          {!postsLive ? (
            <Text style={styles.hint}>
              This goes to an admin for approval before it appears in the feed.
            </Text>
          ) : null}
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor="#888"
          />
          <TextInput
            style={[styles.input, styles.bodyInput]}
            value={body}
            onChangeText={setBody}
            placeholder="Message"
            placeholderTextColor="#888"
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.fieldLabel}>Audience</Text>
          <View style={styles.chips}>
            {AUDIENCES.map((option) => (
              <Pressable
                key={option.id}
                style={[styles.chip, audience === option.id && styles.chipOn]}
                onPress={() => setAudience(option.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    audience === option.id && styles.chipTextOn,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Urgency</Text>
          <View style={styles.urgencySliderRow}>
            <Text
              style={[
                styles.urgencyValue,
                urgency === "high" && styles.urgencyValueHigh,
                urgency === "critical" && styles.urgencyValueCritical,
              ]}
            >
              {urgencyLabel(urgency)}
            </Text>
            {/* Uncontrolled while dragging so iOS 26 Liquid Glass doesn't fight React. */}
            <Slider
              style={styles.urgencySlider}
              minimumValue={0}
              maximumValue={URGENCY_LEVELS.length - 1}
              step={1}
              {...(!urgencyDragging ? { value: urgencyIndex } : {})}
              onSlidingStart={() => setUrgencyDragging(true)}
              onValueChange={(value) => {
                const index = Math.max(
                  0,
                  Math.min(URGENCY_LEVELS.length - 1, Math.round(value)),
                );
                setUrgency(URGENCY_LEVELS[index]!);
              }}
              onSlidingComplete={(value) => {
                snapUrgency(value);
                setUrgencyDragging(false);
              }}
              minimumTrackTintColor={urgencyTrackColor(urgency)}
              maximumTrackTintColor="#c8c8c8"
              thumbTintColor={urgencyTrackColor(urgency)}
              accessibilityLabel="Alert urgency"
            />
            <View style={styles.urgencyEnds}>
              <Text style={styles.urgencyEndText}>Normal</Text>
              <Text style={styles.urgencyEndText}>Critical</Text>
            </View>
          </View>

          {editingId != null ? (
            <>
              <Text style={styles.fieldLabel}>Goes live</Text>
              {Platform.OS === "ios" ? (
                <View style={styles.dateBtn}>
                  <DateTimePicker
                    value={effectiveAt}
                    mode="datetime"
                    display="compact"
                    onChange={(_event, date) => {
                      if (date) pickEffective(date);
                    }}
                  />
                </View>
              ) : (
                <Pressable
                  style={styles.dateBtn}
                  onPress={() => openCalendar("effective")}
                  accessibilityLabel="Pick go-live date and time"
                >
                  <Ionicons name="calendar-outline" size={20} color="#1565C0" />
                  <Text style={styles.dateBtnText}>
                    {formatWhen(effectiveAt.toISOString())}
                  </Text>
                </Pressable>
              )}
            </>
          ) : null}

          <Text style={styles.fieldLabel}>Expires</Text>
          {Platform.OS === "ios" ? (
            <View style={styles.dateBtn}>
              <DateTimePicker
                value={expiresAt}
                mode="datetime"
                display="compact"
                onChange={(_event, date) => {
                  if (date) setExpiresAt(date);
                }}
              />
            </View>
          ) : (
            <Pressable
              style={styles.dateBtn}
              onPress={() => openCalendar("expires")}
              accessibilityLabel="Pick expiry date and time"
            >
              <Ionicons name="calendar-outline" size={20} color="#1565C0" />
              <Text style={styles.dateBtnText}>
                {formatWhen(expiresAt.toISOString())}
              </Text>
            </Pressable>
          )}

          {Platform.OS === "android" && pickerTarget ? (
            <DateTimePicker
              value={androidPickerValue}
              mode={pickerMode}
              display="default"
              onChange={onAndroidPickerChange}
            />
          ) : null}

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
          <Pressable onPress={() => setNotice(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color="#555" />
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={alerts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.list,
          alerts.length === 0 && styles.listEmpty,
          {
            paddingBottom:
              bottomInset + (canCompose ? fabHeight * 2 || 72 : 24),
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          canApprove && pending.length > 0 ? (
            <View style={styles.queue}>
              <Text style={styles.queueTitle}>
                Pending approval ({pending.length})
              </Text>
              {pending.map((item) => {
                const busy = reviewingId === item.id;
                return (
                  <View key={item.id} style={[styles.card, styles.queueCard]}>
                    <AlertCardBody
                      item={item}
                      canManage={canApprove}
                      onManage={() => openAdminMenu(item)}
                    />
                    <AlertCommentThread
                      alertId={item.id}
                      canWrite={canApprove}
                      userId={session?.user?.id}
                    />
                    <View style={styles.reviewRow}>
                      <Pressable
                        style={[styles.reviewBtn, styles.rejectBtn]}
                        disabled={busy}
                        onPress={() => confirmReject(item)}
                      >
                        <Text style={styles.rejectText}>Reject</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.reviewBtn, styles.approveBtn]}
                        disabled={busy}
                        onPress={() => void review(item, "approved")}
                      >
                        {busy ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.approveText}>Approve</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.feedHeading}>Live feed</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          ready ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={36} color="#888" />
              <Text style={styles.emptyTitle}>
                {error
                  ? "Couldn't load alerts"
                  : pending.length > 0
                    ? "No live alerts"
                    : "No alerts"}
              </Text>
              <Text style={styles.emptyBody}>
                {error ?? "Campus messages will show up here."}
              </Text>
              {error ? (
                <Pressable onPress={() => void load()} hitSlop={8}>
                  <Text style={styles.retry}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              item.urgency === "critical" && styles.cardCritical,
              item.urgency === "high" && styles.cardHigh,
            ]}
          >
            <AlertCardBody
              item={item}
              canManage={canApprove}
              onManage={() => openAdminMenu(item)}
            />
            <AlertCommentThread
              alertId={item.id}
              canWrite={canApprove}
              userId={session?.user?.id}
            />
          </View>
        )}
      />
      {canCompose ? (
        <View
          style={[
            styles.fabDock,
            {
              paddingBottom: bottomInset,
              paddingHorizontal: fabHeight > 0 ? fabHeight * 0.3 : undefined,
            },
          ]}
          pointerEvents="box-none"
        >
          <View
            onLayout={(event) => {
              const next = Math.round(event.nativeEvent.layout.height);
              setFabHeight((current) => (current === next ? current : next));
            }}
          >
            {canUseLiquidGlass() ? (
              <GlassCircleButton
                size={56}
                onPress={openNew}
                accessibilityLabel="New alert"
                tintColor="rgba(21, 101, 192, 0.35)"
              >
                <Ionicons name="add" size={28} color="#1565C0" />
              </GlassCircleButton>
            ) : (
              <Pressable
                style={styles.fab}
                onPress={openNew}
                accessibilityLabel="New alert"
              >
                <Ionicons name="add" size={28} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function AlertCardBody({
  item,
  canManage,
  onManage,
}: {
  item: CampusAlert;
  canManage?: boolean;
  onManage?: () => void;
}) {
  const critical = item.urgency === "critical";
  return (
    <>
      <View style={styles.cardTop}>
        <View style={styles.titleRow}>
          {critical ? (
            <Ionicons name="warning" size={20} color="#8a1c1c" />
          ) : null}
          <Text style={[styles.cardTitle, critical && styles.cardTitleCritical]}>
            {item.title}
          </Text>
        </View>
        <View style={styles.cardTopActions}>
          {item.urgency === "normal" ? (
            <View
              style={styles.urgencyDot}
              accessibilityLabel="Normal urgency"
            />
          ) : item.urgency === "high" ? (
            <Text style={[styles.badge, styles.badgeHigh]}>
              {urgencyLabel("high")}
            </Text>
          ) : (
            <Text style={[styles.badge, styles.badgeCritical]}>Critical</Text>
          )}
          {canManage && onManage ? (
            <Pressable
              hitSlop={8}
              onPress={onManage}
              accessibilityLabel="Alert options"
            >
              <Ionicons name="ellipsis-vertical" size={18} color="#666" />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={styles.cardWhen}>
        {AUDIENCE_LABEL[item.audience]} · Sends {formatWhen(item.effective_at)}
      </Text>
      <Text style={styles.cardBody}>{item.body}</Text>
    </>
  );
}

function AlertCommentThread({
  alertId,
  canWrite,
  userId,
}: {
  alertId: number;
  canWrite: boolean;
  userId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<AlertComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadComments = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("alert_comments")
      .select("id, alert_id, body, created_by, created_at")
      .eq("alert_id", alertId)
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      setComments([]);
      return;
    }
    setComments((data as AlertComment[]) ?? []);
  }, [alertId]);

  useEffect(() => {
    if (!open) return;
    void loadComments();
  }, [open, loadComments]);

  useEffect(() => {
    if (!open || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`alert_comments_${alertId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alert_comments",
          filter: `alert_id=eq.${alertId}`,
        },
        () => {
          void loadComments();
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [open, alertId, loadComments]);

  async function sendComment() {
    const text = draft.trim();
    if (!text || !supabase || !userId || !canWrite) return;
    setSending(true);
    const { error } = await supabase.from("alert_comments").insert({
      alert_id: alertId,
      body: text,
      created_by: userId,
    });
    setSending(false);
    if (error) {
      Alert.alert("Couldn't post comment", error.message);
      return;
    }
    setDraft("");
    await loadComments();
  }

  return (
    <View style={styles.thread}>
      <Pressable
        style={styles.threadToggle}
        onPress={() => setOpen((value) => !value)}
      >
        <Text style={styles.threadToggleText}>
          {open
            ? "Hide comments"
            : comments.length > 0
              ? `Comments (${comments.length})`
              : "Comments"}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color="#555"
        />
      </Pressable>
      {open ? (
        <View style={styles.threadBody}>
          {loading ? <ActivityIndicator color="#1565C0" /> : null}
          {!loading && comments.length === 0 ? (
            <Text style={styles.threadEmpty}>No comments yet.</Text>
          ) : null}
          {comments.map((comment) => (
            <View key={comment.id} style={styles.commentBubble}>
              <Text style={styles.commentBody}>{comment.body}</Text>
              <Text style={styles.commentWhen}>
                {formatWhen(comment.created_at)}
              </Text>
            </View>
          ))}
          {canWrite ? (
            <View style={styles.commentCompose}>
              <TextInput
                style={styles.commentInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="Admin comment"
                placeholderTextColor="#888"
                multiline
              />
              <Pressable
                style={[
                  styles.commentSend,
                  (!draft.trim() || sending) && styles.commentSendOff,
                ]}
                disabled={!draft.trim() || sending}
                onPress={() => void sendComment()}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7f8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  link: { color: "#1565C0", fontWeight: "700", fontSize: 16 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  sendMenuAnchor: {
    position: "absolute",
    top: 52,
    right: 12,
    zIndex: 20,
    minWidth: 220,
  },
  sendMenu: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sendMenuGlassStack: {
    minWidth: 220,
    gap: 8,
  },
  sendMenuGlassRow: {
    borderRadius: 14,
    minHeight: 44,
    justifyContent: "center",
  },
  sendMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sendMenuText: { fontSize: 15, fontWeight: "600", color: "#222" },
  schedulePanelGlass: {
    borderRadius: 14,
    minWidth: 220,
  },
  schedulePanel: { paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  scheduleLabel: { fontSize: 13, fontWeight: "700", color: "#555" },
  scheduleActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  hint: { fontSize: 14, color: "#555", marginBottom: 4 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#e8f0fe",
    borderRadius: 12,
  },
  noticeText: { flex: 1, fontSize: 14, color: "#1a3a6b" },
  fabDock: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  fab: {
    backgroundColor: "#1565C0",
    borderRadius: 999,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1, justifyContent: "center" },
  queue: { gap: 12, marginBottom: 4 },
  queueTitle: { fontSize: 16, fontWeight: "700" },
  queueCard: { borderColor: "#c5d4eb", backgroundColor: "#f7faff" },
  feedHeading: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 4,
  },
  reviewRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  reviewBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 40,
  },
  approveBtn: { backgroundColor: "#0B6E4F" },
  approveText: { color: "#fff", fontWeight: "700" },
  rejectBtn: {
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
  },
  rejectText: { color: "#8a1c1c", fontWeight: "700" },
  empty: { alignItems: "center", gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyBody: { fontSize: 15, color: "#555", textAlign: "center" },
  retry: { marginTop: 4, color: "#1565C0", fontWeight: "700", fontSize: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  cardHigh: { borderColor: "#e0b44e", backgroundColor: "#fffaf0" },
  cardCritical: {
    borderColor: "#c62828",
    borderWidth: 1.5,
    backgroundColor: "#fff5f5",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: "700" },
  cardTitleCritical: { color: "#8a1c1c" },
  urgencyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#9e9e9e",
    marginTop: 4,
  },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeHigh: { color: "#7a4d00", backgroundColor: "#fff0d6" },
  badgeCritical: { color: "#8a1c1c", backgroundColor: "#fde8e8" },
  cardWhen: { fontSize: 13, color: "#666" },
  cardBody: { fontSize: 15, color: "#222" },
  thread: { marginTop: 8, gap: 8 },
  threadToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  threadToggleText: { fontSize: 13, fontWeight: "700", color: "#555" },
  threadBody: { gap: 8 },
  threadEmpty: { fontSize: 13, color: "#777" },
  commentBubble: {
    backgroundColor: "#f0f2f4",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  commentBody: { fontSize: 14, color: "#222" },
  commentWhen: { fontSize: 11, color: "#777" },
  commentCompose: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  commentSend: {
    backgroundColor: "#1565C0",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  commentSendOff: { opacity: 0.4 },
  form: { padding: 16, gap: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: "#555", marginTop: 4 },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
  },
  dateBtnText: { fontSize: 16, color: "#222", fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
  },
  chipOn: { backgroundColor: "#1565C0", borderColor: "#1565C0" },
  chipText: { fontSize: 14, fontWeight: "600", color: "#333" },
  chipTextOn: { color: "#fff" },
  urgencySliderRow: { gap: 4 },
  urgencyValue: { fontSize: 15, fontWeight: "700", color: "#1565C0" },
  urgencyValueHigh: { color: "#c88800" },
  urgencyValueCritical: { color: "#c62828" },
  urgencySlider: { width: "100%", height: 36 },
  urgencyEnds: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  urgencyEndText: { fontSize: 12, color: "#777" },
  formError: { color: "#8a1c1c", fontSize: 14 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  bodyInput: { minHeight: 140 },
});
