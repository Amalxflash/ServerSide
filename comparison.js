document.getElementById('comparisonForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const urls1 = document.getElementById('urls1').value.trim().split('\n').map(url => url.trim()).filter(url => url);
  const urls2 = document.getElementById('urls2').value.trim().split('\n').map(url => url.trim()).filter(url => url);

  if (urls1.length === 0 || urls2.length === 0) {
    alert('Please enter at least one URL in both sets.');
    return;
  }

  document.getElementById('loading').style.display = 'block';

  try {
    const response1 = await fetch('http://localhost:3000/check-links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ urls: urls1, filterChecked: false, hierarchyChecked: true, ariaLabelChecked: true, imageChecked: true, textChecked: true })
    });

    const response2 = await fetch('http://localhost:3000/check-links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ urls: urls2, filterChecked: false, hierarchyChecked: true, ariaLabelChecked: true, imageChecked: true, textChecked: true })
    });

    if (!response1.ok || !response2.ok) {
      throw new Error('Network response was not ok');
    }

    const results1 = await response1.json();
    const results2 = await response2.json();

    displayComparison(results1, results2);
  } catch (error) {
    console.error('Error fetching the provided URLs:', error.message);
  } finally {
    document.getElementById('loading').style.display = 'none';
  }
});

document.getElementById('headingRadio').addEventListener('change', showTable);
document.getElementById('ariaRadio').addEventListener('change', showTable);
document.getElementById('imagesRadio').addEventListener('change', showTable);
document.getElementById('textRadio').addEventListener('change', showTable);
document.getElementById('allRadio').addEventListener('change', showTable);

function showTable() {
  const headingTable = document.getElementById('headingTableContainer');
  const ariaTable = document.getElementById('ariaTableContainer');
  const imagesTable = document.getElementById('imagesTableContainer');
  const textTable = document.getElementById('textTableContainer');

  if (document.getElementById('headingRadio').checked) {
    headingTable.style.display = '';
    ariaTable.style.display = 'none';
    imagesTable.style.display = 'none';
    textTable.style.display = 'none';
  } else if (document.getElementById('ariaRadio').checked) {
    headingTable.style.display = 'none';
    ariaTable.style.display = '';
    imagesTable.style.display = 'none';
    textTable.style.display = 'none';
  } else if (document.getElementById('imagesRadio').checked) {
    headingTable.style.display = 'none';
    ariaTable.style.display = 'none';
    imagesTable.style.display = '';
    textTable.style.display = 'none';
  } else if (document.getElementById('textRadio').checked) {
    headingTable.style.display = 'none';
    ariaTable.style.display = 'none';
    imagesTable.style.display = 'none';
    textTable.style.display = '';
  } else if (document.getElementById('allRadio').checked) {
    headingTable.style.display = '';
    ariaTable.style.display = '';
    imagesTable.style.display = '';
    textTable.style.display = '';
  }
}

function displayComparison(results1, results2) {
  document.getElementById('headingHierarchyTableBody').innerHTML = '';
  document.getElementById('ariaLabelTableBody').innerHTML = '';
  document.getElementById('imagesTableBody').innerHTML = '';
  document.getElementById('textContentTableBody').innerHTML = '';

  const getFeatureList = (results, feature) => {
    return results.map(pageResult => pageResult[feature]).flat().map(item => {
      if (item.text) {
        item.text = item.text.trim();
      }
      return item;
    });
  };

  const headingHierarchyList1 = getFeatureList(results1, 'hierarchy');
  const headingHierarchyList2 = getFeatureList(results2, 'hierarchy');
  const ariaLabelList1 = getFeatureList(results1, 'ariaLinks');
  const ariaLabelList2 = getFeatureList(results2, 'ariaLinks');
  const imageList1 = getFeatureList(results1, 'images');
  const imageList2 = getFeatureList(results2, 'images');
  const textContentList1 = getFeatureList(results1, 'textContent');
  const textContentList2 = getFeatureList(results2, 'textContent');

  populateTable('headingHierarchyTableBody', headingHierarchyList1, headingHierarchyList2);
  populateTable('ariaLabelTableBody', ariaLabelList1, ariaLabelList2);
  populateTable('imagesTableBody', imageList1, imageList2);
  populateTable('textContentTableBody', textContentList1, textContentList2);
}

function populateTable(tableBodyId, list1, list2) {
  const tableBody = document.getElementById(tableBodyId);
  const maxLength = Math.max(list1.length, list2.length);

  for (let i = 0; i < maxLength; i++) {
    const tr = document.createElement('tr');
    const set1Cell = document.createElement('td');
    const set2Cell = document.createElement('td');
    const diffCell = document.createElement('td');

    const item1 = list1[i] ? JSON.stringify(list1[i], null, 2) : '';
    const item2 = list2[i] ? JSON.stringify(list2[i], null, 2) : '';

    set1Cell.textContent = item1;
    set2Cell.textContent = item2;
    diffCell.textContent = getDifference(item1, item2);

    highlightDifferences(set1Cell, set2Cell, item1, item2);

    tr.appendChild(set1Cell);
    tr.appendChild(set2Cell);
    tr.appendChild(diffCell);
    tableBody.appendChild(tr);
  }
}

function highlightDifferences(set1Cell, set2Cell, item1, item2) {
  const obj1 = JSON.parse(item1);
  const obj2 = JSON.parse(item2);

  for (const key in obj1) {
    if (obj1[key] !== obj2[key]) {
      highlightCell(set1Cell, obj1[key], 'highlightSet1');
      highlightCell(set2Cell, obj2[key], 'highlightSet2');
    }
  }
}

function highlightCell(cell, value, highlightClass) {
  if (!cell.textContent.includes(value)) return;

  const regex = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  cell.innerHTML = cell.innerHTML.replace(regex, `<span class="${highlightClass}">${value}</span>`);
}

function getDifference(item1, item2) {
  if (!item1 || !item2) return 'Difference: One item is missing';

  const obj1 = JSON.parse(item1);
  const obj2 = JSON.parse(item2);

  const differences = [];
  for (const key in obj1) {
    if (obj1[key] !== obj2[key]) {
      differences.push(`${key} -- ${obj1[key]} AND ${obj2[key]}`);
    }
  }
  for (const key in obj2) {
    if (obj1[key] !== obj2[key] && !obj1.hasOwnProperty(key)) {
      differences.push(`${key} -- ${obj1[key]} AND ${obj2[key]}`);
    }
  }
  return differences.length ? differences.join(', ') : '-';
}