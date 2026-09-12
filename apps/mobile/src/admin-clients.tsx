/**
 * Admin "Clients" tab: search the client directory, and edit a client's
 * contact details directly. Unlike the agent's tools (which gate any write
 * behind an approval card because the AI is proposing the change), this
 * screen is the business owner acting directly on their own data — no
 * approval gate needed.
 */
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { styles } from "@/styles";
import type { Client, ReceptionSnapshot } from "@/reception";

export function AdminClients({
  reception,
  setReception,
}: {
  reception: ReceptionSnapshot;
  setReception: (next: ReceptionSnapshot) => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return reception.clients;
    return reception.clients.filter(
      (client) =>
        client.name.toLowerCase().includes(needle) ||
        client.phone.toLowerCase().includes(needle) ||
        (client.email ?? "").toLowerCase().includes(needle),
    );
  }, [reception.clients, query]);

  function toggleExpand(client: Client) {
    if (expandedId === client.id) {
      setExpandedId(null);
      setDraft(null);
    } else {
      setExpandedId(client.id);
      setDraft(client);
    }
  }

  function saveDraft() {
    if (!draft) return;
    setReception({
      ...reception,
      clients: reception.clients.map((client) => (client.id === draft.id ? draft : client)),
    });
    setExpandedId(null);
    setDraft(null);
  }

  return (
    <View style={{ flex: 1, paddingHorizontal: 16 }}>
      <TextInput
        style={[styles.input, { marginVertical: 12 }]}
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, phone, or email"
        placeholderTextColor="#6e6779"
      />

      <FlatList
        data={filtered}
        keyExtractor={(client) => client.id}
        ListEmptyComponent={<Text style={styles.empty}>No clients match "{query}".</Text>}
        renderItem={({ item: client }) => {
          const isExpanded = expandedId === client.id;
          const history = reception.appointments.filter((appt) => appt.clientId === client.id);

          return (
            <View style={styles.card}>
              <Pressable onPress={() => toggleExpand(client)}>
                <View style={styles.row}>
                  <View style={styles.rowStack}>
                    <Text style={styles.rowLabel}>{client.name}</Text>
                    <Text style={styles.rowMeta}>{client.phone}</Text>
                  </View>
                  <Text style={styles.rowValue}>{history.length} visit{history.length === 1 ? "" : "s"}</Text>
                </View>
              </Pressable>

              {isExpanded && draft ? (
                <View style={[styles.rowDivider, { marginTop: 8, paddingTop: 8, gap: 8 }]}>
                  <TextInput
                    style={styles.input}
                    value={draft.phone}
                    onChangeText={(value) => setDraft({ ...draft, phone: value })}
                    placeholder="Phone"
                    placeholderTextColor="#6e6779"
                  />
                  <TextInput
                    style={styles.input}
                    value={draft.email ?? ""}
                    onChangeText={(value) => setDraft({ ...draft, email: value })}
                    placeholder="Email"
                    placeholderTextColor="#6e6779"
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.input}
                    value={draft.notes ?? ""}
                    onChangeText={(value) => setDraft({ ...draft, notes: value })}
                    placeholder="Notes"
                    placeholderTextColor="#6e6779"
                  />

                  {history.length > 0 ? (
                    <View style={{ gap: 4 }}>
                      <Text style={styles.rowLabel}>History</Text>
                      {history.map((appt) => (
                        <Text key={appt.id} style={styles.rowMeta}>
                          {appt.service} · {appt.time} · {appt.status}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  <Pressable style={[styles.btn, styles.btnPrimary]} onPress={saveDraft}>
                    <Text style={styles.btnPrimaryText}>Save</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}
