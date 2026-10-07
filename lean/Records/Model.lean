namespace Records

structure Session where
  source : String
  generation : Nat
  unlocked : Bool
  published : Option String
  deriving DecidableEq

structure WriteRequest where
  predecessor : String
  generation : Nat
  candidate : String
  supported : Bool
  deriving DecidableEq

def eligible (s : Session) (r : WriteRequest) : Bool :=
  s.unlocked && r.supported && s.source == r.predecessor && s.generation == r.generation

def commit (s : Session) (r : WriteRequest) (storageSucceeded : Bool) : Session :=
  if eligible s r && storageSucceeded then
    { s with source := r.candidate, published := some r.candidate }
  else s

def lock (s : Session) : Session :=
  { s with generation := s.generation + 1, unlocked := false, published := none }

def replace (s : Session) (source : String) : Session :=
  { lock s with source := source }

def publish (s : Session) (capturedGeneration : Nat) (value : String) : Session :=
  if s.unlocked && s.generation == capturedGeneration then
    { s with published := some value }
  else s

structure Field where
  id : String
  name : String
  kind : String
  hidden : Bool
  value : String
  deriving DecidableEq

structure Record where
  title : String
  fields : List Field
  deriving DecidableEq

def rename (record : Record) (title : String) : Record := { record with title := title }

def pack (record : Record) : String × List Field := (record.title, record.fields)

def unpack (wire : String × List Field) : Record := ⟨wire.1, wire.2⟩

def renderedValue (field : Field) (revealed : Bool) : Option String :=
  if field.hidden && !revealed then none else some field.value

inductive Payload where
  | recovery : Record → Payload
  | service : String → Payload
  deriving DecidableEq

def userRecord : Payload → Option Record
  | .recovery record => some record
  | .service _ => none

structure Entry where
  primary : String
  confirmation : Option String
  deriving DecidableEq

def entryAllowed (entry : Entry) : Bool :=
  match entry.confirmation with
  | none => true
  | some value => entry.primary == value

def finishEntry (entry : Entry) : Option String :=
  if entryAllowed entry then some entry.primary else none

end Records
