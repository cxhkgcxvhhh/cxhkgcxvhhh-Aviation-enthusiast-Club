<div class="action-btns">
  <button class="btn btn-approve" onclick="updateStatus(<%= photo.id %>, 'approved')">✅ 通過</button>
  <button class="btn btn-reject" onclick="showRejectModal(<%= photo.id %>)">❌ 拒絕</button>
</div>