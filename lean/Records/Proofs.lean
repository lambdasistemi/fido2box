import Records.Model

namespace Records

theorem changed_source_requires_current_predecessor
    (s : Session) (r : WriteRequest) (saved : Bool)
    (changed : (commit s r saved).source ≠ s.source) :
    s.source = r.predecessor ∧ s.generation = r.generation ∧
      s.unlocked = true ∧ r.supported = true ∧ saved = true := by
  unfold commit at changed
  split at changed
  · rename_i h
    simp only [eligible, Bool.and_eq_true, beq_iff_eq] at h
    exact ⟨h.1.1.2, h.1.2, h.1.1.1.1, h.1.1.1.2, h.2⟩
  · exact False.elim (changed rfl)

theorem failed_storage_preserves_session (s : Session) (r : WriteRequest) :
    commit s r false = s := by simp [commit]

theorem unsupported_write_preserves_session (s : Session) (r : WriteRequest)
    (h : r.supported = false) (saved : Bool) : commit s r saved = s := by
  simp [commit, eligible, h]

theorem rename_preserves_exact_ordered_fields (r : Record) (title : String) :
    (rename r title).fields = r.fields := rfl

theorem abstract_round_trip_preserves_record (r : Record) :
    unpack (pack r) = r := rfl

theorem lock_rejects_late_publication (s : Session) (generation : Nat) (value : String) :
    (publish (lock s) generation value).published = none := by
  simp [publish, lock]

theorem replacement_rejects_old_write (s : Session) (r : WriteRequest)
    (source : String) (saved : Bool) :
    commit (replace s source) r saved = replace s source := by
  simp [commit, eligible, replace, lock]

theorem masked_render_has_no_value (f : Field) (h : f.hidden = true) :
    renderedValue f false = none := by simp [renderedValue, h]

theorem service_has_no_user_record (secret : String) :
    userRecord (.service secret) = none := rfl

theorem confirmation_off_accepts_primary (value : String) :
    finishEntry ⟨value, none⟩ = some value := by simp [finishEntry, entryAllowed]

theorem confirmation_mismatch_refuses_entry (value second : String) (h : value ≠ second) :
    finishEntry ⟨value, some second⟩ = none := by simp [finishEntry, entryAllowed, h]

theorem confirmation_match_keeps_only_primary (value : String) :
    finishEntry ⟨value, some value⟩ = some value := by simp [finishEntry, entryAllowed]

#print axioms changed_source_requires_current_predecessor
#print axioms failed_storage_preserves_session
#print axioms unsupported_write_preserves_session
#print axioms rename_preserves_exact_ordered_fields
#print axioms abstract_round_trip_preserves_record
#print axioms lock_rejects_late_publication
#print axioms replacement_rejects_old_write
#print axioms masked_render_has_no_value
#print axioms service_has_no_user_record
#print axioms confirmation_off_accepts_primary
#print axioms confirmation_mismatch_refuses_entry
#print axioms confirmation_match_keeps_only_primary

end Records
