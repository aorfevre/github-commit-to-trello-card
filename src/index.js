import * as axios from "axios";
import * as core from "@actions/core";
import * as github from "@actions/github";

const { context = {} } = github;
const { pull_request, head_commit } = context.payload;

const regexPullRequest = /Merge pull request \#\d+ from/g;
const trelloApiKey = "f9a66a680f73c64a84a369ff855bc65b";
const trelloAuthToken =
  "6718ae5afbf8eaf4409bffff8eabd0a7caa1b117294b32695358ab67581347a2";
const trelloBoardId = "6155f330c33c1487e8e44b88";
const trelloCardAction = core.getInput("trello-card-action", {
  required: true,
});
const trelloListNameCommit = core.getInput("trello-list-name-commit", {
  required: true,
});
const trelloListNamePullRequestOpen = core.getInput(
  "trello-list-name-pr-open",
  { required: false }
);
const trelloListNamePullRequestClosed = core.getInput(
  "trello-list-name-pr-closed",
  { required: false }
);

function getCardNumber(message) {
  console.log(`getCardNumber`, message);
  let ids =
    message && message.length > 0
      ? message.replace(regexPullRequest, "").match(/\#\d+/g)
      : [];
  return ids && ids.length > 0 ? ids[ids.length - 1].replace("#", "") : null;
}

async function getCardOnBoard(board, message) {
  console.log(`getCardOnBoard(${board}, ${message})`);
  let card = getCardNumber(message);
  console.log("getCardOnBoard", card);
  if (card && card.length > 0) {
    let url = `https://trello.com/1/boards/${board}/cards/${card}`;
    console.log("url", url);
    return await axios
      .get(url, {
        params: {
          key: trelloApiKey,
          token: trelloAuthToken,
        },
      })
      .then((response) => {
        console.log("getCardOnBoard loaded", response.data.id);
        return response.data.id;
      })
      .catch((error) => {
        console.error(
          url,
          `Error ${error.response.status} ${error.response.statusText}`
        );
        return null;
      });
  }
  return null;
}

async function getListOnBoard(board, list) {
  console.log(`getListOnBoard(${board}, ${list})`);
  let url = `https://trello.com/1/boards/${board}/lists`;
  return await axios
    .get(url, {
      params: {
        key: trelloApiKey,
        token: trelloAuthToken,
      },
    })
    .then((response) => {
      let result = response.data.find(
        (l) => l.closed == false && l.name == list
      );
      console.log("getListOnBoard", result);
      return result ? result.id : null;
    })
    .catch((error) => {
      console.error(
        url,
        `Error ${error.response.status} ${error.response.statusText}`
      );
      return null;
    });
}

async function addAttachmentToCard(card, link) {
  console.log(`addAttachmentToCard(${card}, ${link})`);
  let url = `https://api.trello.com/1/cards/${card}/attachments`;
  return await axios
    .post(url, {
      key: trelloApiKey,
      token: trelloAuthToken,
      url: link,
    })
    .then((response) => {
      console.log("Add Attachment", response);
      return response.status == 200;
    })
    .catch((error) => {
      console.error(
        url,
        `Error ${error.response.status} ${error.response.statusText}`
      );
      return null;
    });
}

async function addCommentToCard(card, user, message, link) {
  console.log(`addCommentToCard(${card}, ${user}, ${message}, ${link})`);
  let url = `https://api.trello.com/1/cards/${card}/actions/comments`;
  return await axios
    .post(url, {
      key: trelloApiKey,
      token: trelloAuthToken,
      text: `${user}: ${message} ${link}`,
    })
    .then((response) => {
      return response.status == 200;
    })
    .catch((error) => {
      console.error(
        url,
        `Error ${error.response.status} ${error.response.statusText}`
      );
      return null;
    });
}

async function moveCardToList(board, card, list) {
  console.log(`moveCardToList(${board}, ${card}, ${list})`);
  let listId = await getListOnBoard(board, list);
  if (listId && listId.length > 0) {
    let url = `https://api.trello.com/1/cards/${card}`;
    return await axios
      .put(url, {
        key: trelloApiKey,
        token: trelloAuthToken,
        idList: listId,
      })
      .then((response) => {
        return response && response.status == 200;
      })
      .catch((error) => {
        console.error(
          url,
          `Error ${error.response.status} ${error.response.statusText}`
        );
        return null;
      });
  }
  return null;
}

async function handleHeadCommit(data) {
  console.log("handleHeadCommit", data);
  let url = data.url;
  let message = data.message;
  let user = data.author.name;
  let card = await getCardOnBoard(trelloBoardId, message);
  if (card && card.length > 0) {
    if (trelloCardAction && trelloCardAction.toLowerCase() == "attachment") {
      console.log("Add Attachment -> New");
      await addAttachmentToCard(card, url);
    } else if (
      trelloCardAction &&
      trelloCardAction.toLowerCase() == "comment"
    ) {
      await addCommentToCard(card, user, message, url);
    }
    if (
      message.match(regexPullRequest) &&
      trelloListNamePullRequestClosed &&
      trelloListNamePullRequestClosed.length > 0
    ) {
      await moveCardToList(
        trelloBoardId,
        card,
        trelloListNamePullRequestClosed
      );
    } else if (trelloListNameCommit && trelloListNameCommit.length > 0) {
      await moveCardToList(trelloBoardId, card, trelloListNameCommit);
    }
  }
}

async function handlePullRequest(data) {
  console.log("handlePullRequest", data);
  let url = data.html_url || data.url;
  let message = data.title;
  let user = data.user.name;
  let card = await getCardOnBoard(trelloBoardId, message);
  console.log("CARD", card);
  if (card && card.length > 0) {
    if (trelloCardAction && trelloCardAction.toLowerCase() == "attachment") {
      await addAttachmentToCard(card, url);
    } else if (
      trelloCardAction &&
      trelloCardAction.toLowerCase() == "comment"
    ) {
      await addCommentToCard(card, user, message, url);
    }
    console.log("DATA", data);
    if (
      data.state == "open" &&
      trelloListNamePullRequestOpen &&
      trelloListNamePullRequestOpen.length > 0
    ) {
      await moveCardToList(trelloBoardId, card, trelloListNamePullRequestOpen);
    } else if (
      data.state == "closed" &&
      trelloListNamePullRequestClosed &&
      trelloListNamePullRequestClosed.length > 0
    ) {
      await moveCardToList(
        trelloBoardId,
        card,
        trelloListNamePullRequestClosed
      );
    }
  }
}

async function run() {
  if (head_commit && head_commit.message) {
    handleHeadCommit(head_commit);
  } else if (pull_request && pull_request.title) {
    handlePullRequest(pull_request);
  }
}

run();
