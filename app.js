import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const msg = (text) => { $("message").textContent = text; };
const photoBucket = "pet-photos";
const maxPhotoSize = 5 * 1024 * 1024;
let user = null;
let editingEntry = null;
let calendarDate = new Date();
let entryDates = new Set();

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

$("diaryDate").value = formatDate(new Date());

function isValidImage(file) {
  return !file || (file.size <= maxPhotoSize && file.type.startsWith("image/"));
}

async function uploadPhoto(file) {
  if (!file) return null;
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(photoBucket).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

async function removePhoto(path) {
  if (path) await supabase.storage.from(photoBucket).remove([path]);
}

function showAppView(pets) {
  const hasPet = pets.length > 0;
  $("petRegistrationCard").hidden = hasPet;
  $("diaryArea").hidden = !hasPet;
}

function setEditingMode(entry = null) {
  editingEntry = entry;
  const saveButton = $("diaryForm").querySelector("button[type='submit'], button:not([type])");
  saveButton.textContent = entry ? "수정 저장" : "일기 저장";
  let cancelButton = $("cancelEdit");
  if (!cancelButton) {
    cancelButton = document.createElement("button");
    cancelButton.id = "cancelEdit";
    cancelButton.type = "button";
    cancelButton.className = "secondary";
    cancelButton.textContent = "수정 취소";
    saveButton.insertAdjacentElement("afterend", cancelButton);
    cancelButton.onclick = resetDiaryForm;
  }
  cancelButton.hidden = !entry;
}

function resetDiaryForm() {
  $("diaryForm").reset();
  $("diaryDate").value = formatDate(new Date());
  $("photo").value = "";
  setEditingMode();
  renderCalendar();
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const selectedDate = $("diaryDate").value;
  $("calendarMonth").textContent = `${year}년 ${month + 1}월`;
  $("calendarDays").replaceChildren();

  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  for (let blank = 0; blank < firstDay; blank += 1) {
    const empty = document.createElement("span");
    empty.className = "calendar-empty";
    $("calendarDays").append(empty);
  }
  for (let day = 1; day <= lastDate; day += 1) {
    const date = new Date(year, month, day);
    const dateText = formatDate(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.textContent = day;
    button.setAttribute("aria-label", `${dateText} 일기 작성`);
    if (dateText === selectedDate) button.classList.add("selected");
    if (entryDates.has(dateText)) button.classList.add("has-entry");
    button.onclick = () => {
      if (editingEntry) setEditingMode();
      $("diaryDate").value = dateText;
      $("diaryTitle").value = "";
      $("diaryBody").value = "";
      $("photo").value = "";
      renderCalendar();
      $("diaryTitle").focus();
    };
    $("calendarDays").append(button);
  }
}

$("previousMonth").onclick = () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
  renderCalendar();
};
$("nextMonth").onclick = () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
  renderCalendar();
};
$("diaryDate").onchange = () => {
  const selected = new Date(`${$("diaryDate").value}T00:00:00`);
  if (!Number.isNaN(selected.getTime())) calendarDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
  renderCalendar();
};

async function refreshSession() {
  const { data: { user: current } } = await supabase.auth.getUser();
  user = current;
  $("authPanel").hidden = !!user;
  $("appPanel").hidden = !user;
  if (!user) return;
  $("who").textContent = user.email;
  const pets = await loadPets();
  showAppView(pets);
  if (pets.length) await loadEntries();
}

$("signup").onclick = async () => {
  const { error } = await supabase.auth.signUp({ email: $("email").value, password: $("password").value });
  msg(error?.message || "가입 요청이 완료되었습니다. 이메일 인증 설정을 확인해 주세요.");
};

$("login").onclick = async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: $("email").value, password: $("password").value });
  if (error) return msg(error.message);
  await refreshSession();
};

$("logout").onclick = async () => {
  await supabase.auth.signOut();
  await refreshSession();
};

$("petForm").onsubmit = async (event) => {
  event.preventDefault();
  const file = $("petPhoto").files[0];
  if (!isValidImage(file)) return msg("사진은 5MB 이하의 이미지 파일만 등록할 수 있습니다.");
  let photoPath = null;
  try {
    photoPath = await uploadPhoto(file);
  } catch (error) {
    return msg(`사진 업로드 실패: ${error.message}`);
  }
  const { error } = await supabase.from("pets").insert({
    user_id: user.id, name: $("petName").value.trim(), species: $("species").value,
    birthday: $("birthday").value || null, photo_path: photoPath,
  });
  if (error) {
    await removePhoto(photoPath);
    return msg(error.message);
  }
  $("petForm").reset();
  const pets = await loadPets();
  showAppView(pets);
  await loadEntries();
  msg("반려동물을 등록했습니다.");
};

async function loadPets() {
  const { data, error } = await supabase.from("pets").select("id,name,species,photo_path").order("created_at");
  if (error) {
    msg(error.message);
    return [];
  }
  $("petSelect").replaceChildren();
  $("petProfile").replaceChildren();
  for (const pet of data) {
    $("petSelect").add(new Option(pet.name, pet.id));
  }
  const pet = data[0];
  if (pet?.photo_path) {
    const { data: signed } = await supabase.storage.from(photoBucket).createSignedUrl(pet.photo_path, 3600);
    if (signed) {
      const image = document.createElement("img");
      image.src = signed.signedUrl;
      image.alt = `${pet.name} 사진`;
      image.className = "pet-profile-image";
      $("petProfile").append(image);
    }
  }
  return data;
}

$("diaryForm").onsubmit = async (event) => {
  event.preventDefault();
  const file = $("photo").files[0];
  if (!isValidImage(file)) return msg("사진은 5MB 이하의 이미지 파일만 등록할 수 있습니다.");
  const isEditing = Boolean(editingEntry);
  let newPhotoPath = null;
  try {
    newPhotoPath = await uploadPhoto(file);
  } catch (error) {
    return msg(`사진 업로드 실패: ${error.message}`);
  }
  const values = {
    pet_id: $("petSelect").value,
    entry_date: $("diaryDate").value,
    title: $("diaryTitle").value.trim(),
    body: $("diaryBody").value,
    photo_path: newPhotoPath || editingEntry?.photo_path || null,
  };
  const request = isEditing
    ? supabase.from("diary_entries").update(values).eq("id", editingEntry.id)
    : supabase.from("diary_entries").insert({ user_id: user.id, ...values });
  const { error } = await request;
  if (error) {
    await removePhoto(newPhotoPath);
    return msg(error.message);
  }
  if (isEditing && newPhotoPath && editingEntry.photo_path) await removePhoto(editingEntry.photo_path);
  msg(isEditing ? "일기를 수정했습니다." : "일기를 저장했습니다.");
  resetDiaryForm();
  await loadEntries();
};

function editEntry(entry) {
  $("petSelect").value = entry.pet_id;
  $("diaryDate").value = entry.entry_date;
  $("diaryTitle").value = entry.title;
  $("diaryBody").value = entry.body || "";
  $("photo").value = "";
  const selected = new Date(`${entry.entry_date}T00:00:00`);
  calendarDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
  setEditingMode(entry);
  renderCalendar();
  $("diaryForm").scrollIntoView({ behavior: "smooth", block: "start" });
  $("diaryTitle").focus();
}

async function loadEntries() {
  const { data, error } = await supabase.from("diary_entries").select("id,pet_id,entry_date,title,body,photo_path,pets(name)").order("entry_date", { ascending: false }).limit(100);
  if (error) return msg(error.message);
  entryDates = new Set(data.map((entry) => entry.entry_date));
  renderCalendar();
  $("entries").replaceChildren();
  for (const entry of data) {
    const article = document.createElement("article");
    article.className = "entry";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${entry.entry_date} · ${entry.pets?.name || "반려동물"}`;
    const title = document.createElement("h3"); title.textContent = entry.title;
    const body = document.createElement("p"); body.textContent = entry.body || "";
    article.append(meta, title, body);
    if (entry.photo_path) {
      const { data: signed } = await supabase.storage.from(photoBucket).createSignedUrl(entry.photo_path, 3600);
      if (signed) {
        const image = document.createElement("img");
        image.src = signed.signedUrl;
        image.alt = "일기 사진";
        article.append(image);
      }
    }
    const editButton = document.createElement("button");
    editButton.className = "secondary";
    editButton.textContent = "수정";
    editButton.onclick = () => editEntry(entry);
    const removeButton = document.createElement("button");
    removeButton.className = "secondary";
    removeButton.textContent = "삭제";
    removeButton.onclick = async () => {
      if (!confirm("이 일기를 삭제할까요?")) return;
      const { error: deleteError } = await supabase.from("diary_entries").delete().eq("id", entry.id);
      if (deleteError) return msg(deleteError.message);
      await removePhoto(entry.photo_path);
      if (editingEntry?.id === entry.id) resetDiaryForm();
      msg("삭제했습니다.");
      await loadEntries();
    };
    article.append(editButton, removeButton);
    $("entries").append(article);
  }
  if (!data.length) $("entries").textContent = "아직 작성한 일기가 없습니다.";
}

supabase.auth.onAuthStateChange(() => setTimeout(() => refreshSession().catch((error) => msg(error.message)), 0));
renderCalendar();
refreshSession().catch((error) => msg(error.message));
