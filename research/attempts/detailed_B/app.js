/**
 * Учебная детерминированная симуляция работы AI-агента.
 * Все метрики (успешность, стоимость, задержка, количество шагов) вычисляются
 * строго на основе фактически сгенерированной последовательности шагов по каждой задаче.
 *
 * Как воспроизвести обязательный контрольный сценарий:
 * 1. Оставьте выбранным фильтр «Все задачи (12)».
 * 2. Выберите стратегию «2. Планирование и ответ» и нажмите «Запустить симуляцию».
 *    Результат: Успешность 41.7% (5/12), 24 шага, 240 у.е., 18 000 мс.
 * 3. Не меняя фильтр задач, выберите «3. Планирование, ответ и проверка» и нажмите «Запустить симуляцию».
 *    Результат: Успешность 83.3% (10/12), 41 шаг (+17 шагов: 12 проверок и 5 исправлений),
 *    367 у.е. (+127 у.е.), 28 400 мс (+10 400 мс).
 *    5 исправимых ошибок (T-03, T-06, T-07, T-10, T-12) исправлены шагом fix,
 *    2 неисправимые ошибки (T-08, T-11) остались нерешёнными.
 */

(function () {
  "use strict";

  // 1. ПАРАМЕТРЫ СЛОЖНОСТИ И БАЗОВЫЕ ТАРИФЫ ОПЕРАЦИЙ
  const DIFFICULTY_META = {
    easy: {
      id: "easy",
      label: "Простая",
      multiplier: 1,
      badgeClass: "badge-easy"
    },
    medium: {
      id: "medium",
      label: "Средняя",
      multiplier: 2,
      badgeClass: "badge-medium"
    },
    hard: {
      id: "hard",
      label: "Сложная",
      multiplier: 3,
      badgeClass: "badge-hard"
    }
  };

  // Базовые коэффициенты каждого типа шага (умножаются на коэффициент сложности задачи K)
  const STEP_RULES = {
    plan: {
      type: "plan",
      label: "Планирование",
      shortLabel: "План",
      pillClass: "step-pill-plan",
      baseCost: 4,      // у.е. при K = 1
      baseLatency: 300  // мс при K = 1
    },
    answer: {
      type: "answer",
      label: "Генерация ответа",
      shortLabel: "Ответ",
      pillClass: "step-pill-answer",
      baseCost: 6,      // у.е. при K = 1
      baseLatency: 450  // мс при K = 1
    },
    verify: {
      type: "verify",
      label: "Проверка ответа",
      shortLabel: "Проверка",
      pillClass: "step-pill-verify",
      baseCost: 3,      // у.е. при K = 1
      baseLatency: 250  // мс при K = 1
    },
    fix: {
      type: "fix",
      label: "Исправление ошибки",
      shortLabel: "Исправление",
      pillClass: "step-pill-fix",
      baseCost: 5,      // у.е. при K = 1
      baseLatency: 400  // мс при K = 1
    }
  };

  // Описание стратегий
  const STRATEGIES = {
    direct: {
      id: "direct",
      name: "Прямой ответ",
      shortName: "1. Прямой ответ",
      description: "Один основной шаг генерации ответа без предварительного плана и проверки."
    },
    plan_answer: {
      id: "plan_answer",
      name: "Планирование и ответ",
      shortName: "2. Планирование и ответ",
      description: "Декомпозиция задачи на шаге планирования, затем генерация ответа."
    },
    plan_verify: {
      id: "plan_verify",
      name: "Планирование, ответ и проверка",
      shortName: "3. Планирование, ответ и проверка",
      description: "Планирование, ответ, затем валидация и отдельный шаг исправления для исправимых ошибок."
    }
  };

  // 2. ВСТРОЕННЫЙ НАБОР ИЗ 12 ОСМЫСЛЕННЫХ ЗАДАЧ ТРЁХ УРОВНЕЙ СЛОЖНОСТИ
  // Типы поведения (archetype):
  // - "direct_ok": решается сразу даже без планирования
  // - "plan_helps": прямой ответ ошибается, но планирование даёт верный ответ с первого раза
  // - "verify_fixes": после плана и ответа остаётся исправимая ошибка; шаг verify её находит, а шаг fix исправляет
  // - "unfixable": содержит фундаментально неисправимую ошибку (нет доступа к внешней БД или противоречивое условие)
  const TASKS = [
    // --- ПРОСТЫЕ ЗАДАЧИ (easy, K = 1) ---
    {
      id: "T-01",
      title: "Извлечение даты и итоговой суммы из текста кассового чека",
      difficulty: "easy",
      archetype: "direct_ok",
      directOutcome: "success",
      plannedOutcome: "success",
      directNote: "Шаблон чека стандартный: дата и сумма извлечены верно с первого шага.",
      planNote: "Составлен план поиска полей даты и итога (на простой задаче шаг избыточен).",
      plannedAnswerNote: "Поля даты и суммы извлечены корректно.",
      verifyNote: "Проверка подтвердила совпадение формата даты YYYY-MM-DD и суммы.",
      fixNote: null
    },
    {
      id: "T-02",
      title: "Классификация обращения клиента в техподдержку по 4 рубрикам",
      difficulty: "easy",
      archetype: "direct_ok",
      directOutcome: "success",
      plannedOutcome: "success",
      directNote: "Ключевые маркеры возврата средств однозначны, рубрика определена верно.",
      planNote: "Составлен список критериев для 4 рубрик (дополнительная трата ресурсов).",
      plannedAnswerNote: "Выбрана верная категория «Возврат и биллинг».",
      verifyNote: "Валидация подтвердила соответствие ответа списку разрешённых рубрик.",
      fixNote: null
    },
    {
      id: "T-03",
      title: "Преобразование карточек контактов в строгий JSON со схемой",
      difficulty: "easy",
      archetype: "verify_fixes",
      directOutcome: "fail",
      plannedOutcome: "fixable_error",
      directNote: "Ошибка: нарушена структура вложенных объектов и пропущены обязательные ключи.",
      planNote: "Составлена целевая JSON-схема и таблица маппинга полей.",
      plannedAnswerNote: "Исправимая ошибка: структура по плану верна, но не экранированы кавычки в названии компании («ООО \"Бета\"»).",
      verifyNote: "Проверка парсером обнаружила синтаксическую ошибку JSON в строке 4 (неэкранированная кавычка).",
      fixNote: "Шаг исправления экранировал спецсимволы (\\\"), итоговый JSON валиден."
    },
    {
      id: "T-04",
      title: "Расчёт финальной цены корзины с двухуровневым правилом промокода",
      difficulty: "easy",
      archetype: "plan_helps",
      directOutcome: "fail",
      plannedOutcome: "success",
      directNote: "Ошибка: агент сложил процентную и фиксированную скидки вместо их последовательного применения.",
      planNote: "План зафиксировал порядок: 1) применить порог 10%, 2) вычесть купон 300 ед.",
      plannedAnswerNote: "Расчёт выполнен строго по плану, итоговая сумма совпала с эталоном.",
      verifyNote: "Проверка пересчитала промежуточные суммы — ошибок не обнаружено.",
      fixNote: null
    },

    // --- СРЕДНИЕ ЗАДАЧИ (medium, K = 2) ---
    {
      id: "T-05",
      title: "Составление расписания 4 встреч для участников из разных часовых поясов",
      difficulty: "medium",
      archetype: "plan_helps",
      directOutcome: "fail",
      plannedOutcome: "success",
      directNote: "Ошибка: при переводе слотов «на лету» возникло наложение встреч между UTC+3 и UTC+5.",
      planNote: "План привёл все рабочие окна участников к единой шкале UTC перед подбором слотов.",
      plannedAnswerNote: "Расписание составлено без пересечений и в пределах рабочего времени всех участников.",
      verifyNote: "Проверка сверила все 4 интервала с ограничениями участников — конфликтов нет.",
      fixNote: null
    },
    {
      id: "T-06",
      title: "Генерация SQL-запроса с группировкой и фильтрацией агрегатов HAVING",
      difficulty: "medium",
      archetype: "verify_fixes",
      directOutcome: "fail",
      plannedOutcome: "fixable_error",
      directNote: "Ошибка: агрегатная функция COUNT(*) помещена в секцию WHERE вместо HAVING.",
      planNote: "План разделил фильтрацию строк (WHERE) и фильтрацию групп (GROUP BY + HAVING).",
      plannedAnswerNote: "Исправимая ошибка: структура запроса верна, но для условия «не менее 10 заказов» использован строгий оператор > 10 вместо >= 10.",
      verifyNote: "Проверка граничных значений выявила потерю клиентов ровно с 10 заказами (ошибка оператора >).",
      fixNote: "Запрос исправлен на HAVING COUNT(order_id) >= 10; условие задачи полностью выполнено."
    },
    {
      id: "T-07",
      title: "Сводка квартального отчёта с проверкой сходимости баланса по статьям",
      difficulty: "medium",
      archetype: "verify_fixes",
      directOutcome: "fail",
      plannedOutcome: "fixable_error",
      directNote: "Ошибка: пропущена статья операционных возвратов, структура таблицы неполная.",
      planNote: "План выделил все 6 статей доходов и расходов из исходного текста.",
      plannedAnswerNote: "Исправимая ошибка: все статьи включены в таблицу, но в итоговом сальдо допущена арифметическая ошибка на 120 ед.",
      verifyNote: "Проверка контрольной суммы выявила расхождение между суммой строк (4 820) и указанным итогом (4 700).",
      fixNote: "Итоговое сальдо и строка баланса пересчитаны и исправлены на 4 820 ед."
    },
    {
      id: "T-08",
      title: "Запрос актуального остатка партии товара в закрытом контуре складской ERP",
      difficulty: "medium",
      archetype: "unfixable",
      directOutcome: "fail",
      plannedOutcome: "unfixable_error",
      directNote: "Ошибка: агент сгенерировал правдоподобное, но вымышленное число остатка (галлюцинация).",
      planNote: "План определил необходимость чтения таблицы остатков по артикулу SKU-904.",
      plannedAnswerNote: "Неисправимая ошибка: у агента отсутствуют учётные данные и сетевой доступ к закрытой складской БД ERP.",
      verifyNote: "Проверка зафиксировала отсутствие верифицируемого источника данных. Самопроверка не может заменить отсутствующий доступ к внешней БД — шаг исправления не вызывается.",
      fixNote: null
    },

    // --- СЛОЖНЫЕ ЗАДАЧИ (hard, K = 3) ---
    {
      id: "T-09",
      title: "Проектирование плана миграции БД микросервиса без простоя (Zero-Downtime)",
      difficulty: "hard",
      archetype: "plan_helps",
      directOutcome: "fail",
      plannedOutcome: "success",
      directNote: "Ошибка: предложено переключить трафик до завершения синхронизации новых колонок, что вызовет простой.",
      planNote: "План выстроил паттерн Expand → Dual-Write → Backfill → Switch Read → Contract.",
      plannedAnswerNote: "Пошаговый регламент миграции сформирован корректно и гарантирует обратную совместимость релизов.",
      verifyNote: "Проверка подтвердила безопасность отката на каждом из 5 этапов миграции.",
      fixNote: null
    },
    {
      id: "T-10",
      title: "Рефакторинг рекурсивного обхода дерева в итеративный с лимитом глубины",
      difficulty: "hard",
      archetype: "verify_fixes",
      directOutcome: "fail",
      plannedOutcome: "fixable_error",
      directNote: "Ошибка: при отказе от рекурсии нарушен порядок обхода узлов и потерян контроль глубины.",
      planNote: "План определил структуру явного стека пар (node, depth) и условие отсечения по maxDepth.",
      plannedAnswerNote: "Исправимая ошибка: алгоритм со стеком корректен, но не обработан граничный случай пустого корня (root === null), вызывающий исключение.",
      verifyNote: "Проверка на краевых тестах обнаружила обращение к свойству children у null при пустом дереве.",
      fixNote: "Добавлена защитная проверка if (!root) return []; в начало функции — все тесты проходят."
    },
    {
      id: "T-11",
      title: "Построение маршрута доставки с взаимно противоречивыми ограничениями ТЗ",
      difficulty: "hard",
      archetype: "unfixable",
      directOutcome: "fail",
      plannedOutcome: "unfixable_error",
      directNote: "Ошибка: предложенный маршрут нарушает временные окна и скоростной режим.",
      planNote: "План выписал матрицу расстояний (250 км) и директивное окно доставки (40 минут).",
      plannedAnswerNote: "Неисправимая ошибка: требования заказчика физически несовместны (проехать 250 км за 40 мин на грузовом фургоне без нарушения ПДД невозможно).",
      verifyNote: "Проверка доказала математическую неразрешимость системы ограничений (требуемая скорость 375 км/ч > лимита 90 км/ч). Без изменения условий заказчиком исправление невозможно.",
      fixNote: null
    },
    {
      id: "T-12",
      title: "Аудит и патч смарт-контракта на уязвимость повторного входа (Reentrancy)",
      difficulty: "hard",
      archetype: "verify_fixes",
      directOutcome: "fail",
      plannedOutcome: "fixable_error",
      directNote: "Ошибка: агент указал только на стилевые замечания и пропустил внешний вызов до списания баланса.",
      planNote: "План предписал проверить все внешние вызовы по паттерну Checks-Effects-Interactions.",
      plannedAnswerNote: "Исправимая ошибка: баланс пользователя перенесён до внешнего вызова, но глобальный счётчик totalLocked обновляется после вызова.",
      verifyNote: "Проверка инвариантов состояния обнаружила, что переменная totalLocked остаётся уязвимой к повторному входу.",
      fixNote: "Обновление totalLocked перенесено в секцию Effects до внешнего вызова — уязвимость полностью закрыта."
    }
  ];

  // 3. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
  const state = {
    runHistory: [],         // История выполненных запусков (сохраняем все запуски сессии)
    currentRun: null,       // Последний активный запуск
    lastRunConfigKey: null  // Ключ конфигурации последнего запуска для отслеживания устаревания фильтра/стратегии
  };

  // 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ФОРМАТИРОВАНИЯ
  function formatNumber(num) {
    return Number(num).toLocaleString("ru-RU");
  }

  function formatPercent(value) {
    return value.toFixed(1) + "%";
  }

  function getSelectedStrategyId() {
    const checked = document.querySelector('input[name="strategy"]:checked');
    return checked ? checked.value : "plan_answer";
  }

  function getSelectedDifficulties() {
    const checkboxes = document.querySelectorAll(".difficulty-checkboxes input[type='checkbox']");
    const selected = [];
    checkboxes.forEach(function (cb) {
      if (cb.checked) {
        selected.push(cb.value);
      }
    });
    return selected;
  }

  function getFilteredTasks(difficulties) {
    const set = new Set(difficulties);
    return TASKS.filter(function (task) {
      return set.has(task.difficulty);
    });
  }

  function buildTaskSetKey(tasks) {
    return tasks.map(function (t) { return t.id; }).join(",");
  }

  function describeTaskSet(difficulties, taskCount) {
    if (taskCount === 0) {
      return "Пустой набор (0 задач)";
    }
    if (difficulties.length === 3) {
      return "Все задачи (" + taskCount + ")";
    }
    const labels = difficulties.map(function (d) {
      return DIFFICULTY_META[d].label;
    });
    return labels.join(" + ") + " (" + taskCount + " зад.)";
  }

  function getCurrentConfigKey() {
    const strategyId = getSelectedStrategyId();
    const diffs = getSelectedDifficulties();
    const tasks = getFilteredTasks(diffs);
    return strategyId + "::" + buildTaskSetKey(tasks);
  }

  // 5. ЯДРО ДЕТЕРМИНИРОВАННОЙ СИМУЛЯЦИИ
  /**
   * Выполняет детерминированную симуляцию для одной задачи и выбранной стратегии.
   * Возвращает фактический массив выполненных шагов и вычисленный исход.
   */
  function simulateTask(task, strategyId) {
    const diffMeta = DIFFICULTY_META[task.difficulty];
    const K = diffMeta.multiplier;
    const steps = [];

    function createStep(stepType, actionText, statusLabel) {
      const rule = STEP_RULES[stepType];
      const cost = rule.baseCost * K;
      const latencyMs = rule.baseLatency * K;
      return {
        taskId: task.id,
        taskTitle: task.title,
        difficulty: task.difficulty,
        difficultyLabel: diffMeta.label,
        multiplier: K,
        type: rule.type,
        typeLabel: rule.label,
        shortLabel: rule.shortLabel,
        pillClass: rule.pillClass,
        actionText: actionText,
        statusLabel: statusLabel,
        stepsContribution: 1,
        cost: cost,
        tokens: cost * 100,
        latencyMs: latencyMs
      };
    }

    let finalSuccess = false;
    let outcomeCategory = "";
    let outcomeBadgeText = "";
    let diagnosticSummary = "";

    if (strategyId === "direct") {
      // Стратегия 1: только один основной шаг ответа
      if (task.directOutcome === "success") {
        steps.push(createStep("answer", task.directNote, "Ответ корректен"));
        finalSuccess = true;
        outcomeCategory = "direct_success";
        outcomeBadgeText = "Успех (прямой ответ)";
        diagnosticSummary = task.directNote;
      } else {
        steps.push(createStep("answer", task.directNote, "Ошибка в ответе"));
        finalSuccess = false;
        outcomeCategory = "direct_fail";
        outcomeBadgeText = "Неудача (без плана и проверки)";
        diagnosticSummary = task.directNote;
      }
    } else if (strategyId === "plan_answer") {
      // Стратегия 2: шаг планирования + шаг ответа
      steps.push(createStep("plan", task.planNote, "План построен"));

      if (task.plannedOutcome === "success") {
        steps.push(createStep("answer", task.plannedAnswerNote, "Ответ по плану корректен"));
        finalSuccess = true;
        outcomeCategory = "planned_success";
        outcomeBadgeText = "Успех (решено за счёт плана)";
        diagnosticSummary = task.plannedAnswerNote;
      } else if (task.plannedOutcome === "fixable_error") {
        steps.push(createStep("answer", task.plannedAnswerNote, "Скрытая исправимая ошибка"));
        finalSuccess = false;
        outcomeCategory = "fixable_error_unverified";
        outcomeBadgeText = "Неудача (исправимая ошибка не проверена)";
        diagnosticSummary = task.plannedAnswerNote;
      } else {
        // unfixable_error
        steps.push(createStep("answer", task.plannedAnswerNote, "Неисправимая ошибка"));
        finalSuccess = false;
        outcomeCategory = "unfixable_error";
        outcomeBadgeText = "Неудача (неисправимая ошибка)";
        diagnosticSummary = task.plannedAnswerNote;
      }
    } else if (strategyId === "plan_verify") {
      // Стратегия 3: планирование + ответ + проверка [+ исправление для исправимой ошибки]
      steps.push(createStep("plan", task.planNote, "План построен"));

      if (task.plannedOutcome === "success") {
        steps.push(createStep("answer", task.plannedAnswerNote, "Ответ по плану корректен"));
        steps.push(createStep("verify", task.verifyNote, "Проверка: ошибок нет"));
        finalSuccess = true;
        outcomeCategory = "verified_already_ok";
        outcomeBadgeText = "Успех (подтверждено проверкой)";
        diagnosticSummary = task.verifyNote;
      } else if (task.plannedOutcome === "fixable_error") {
        steps.push(createStep("answer", task.plannedAnswerNote, "Черновой ответ с дефектом"));
        steps.push(createStep("verify", task.verifyNote, "Обнаружена исправимая ошибка"));
        steps.push(createStep("fix", task.fixNote, "Ошибка успешно исправлена"));
        finalSuccess = true;
        outcomeCategory = "fixed_by_verify";
        outcomeBadgeText = "Успех (исправлено после проверки)";
        diagnosticSummary = task.fixNote;
      } else {
        // unfixable_error — проверка видит фундаментальное ограничение и не может сделать ответ верным
        steps.push(createStep("answer", task.plannedAnswerNote, "Невыполнимое условие / нет данных"));
        steps.push(createStep("verify", task.verifyNote, "Ошибка признана неисправимой"));
        finalSuccess = false;
        outcomeCategory = "unfixable_error";
        outcomeBadgeText = "Неудача (неисправимая ошибка)";
        diagnosticSummary = task.verifyNote;
      }
    }

    // Вычисляем показатели задачи строго как сумму её шагов
    let taskCost = 0;
    let taskLatencyMs = 0;
    let taskStepsCount = 0;

    steps.forEach(function (st) {
      taskCost += st.cost;
      taskLatencyMs += st.latencyMs;
      taskStepsCount += st.stepsContribution;
    });

    return {
      taskId: task.id,
      title: task.title,
      difficulty: task.difficulty,
      difficultyLabel: diffMeta.label,
      difficultyBadgeClass: diffMeta.badgeClass,
      multiplier: K,
      archetype: task.archetype,
      success: finalSuccess,
      outcomeCategory: outcomeCategory,
      outcomeBadgeText: outcomeBadgeText,
      diagnosticSummary: diagnosticSummary,
      steps: steps,
      stepCount: taskStepsCount,
      cost: taskCost,
      tokens: taskCost * 100,
      latencyMs: taskLatencyMs
    };
  }

  /**
   * Выполняет полный запуск симуляции на выбранном наборе задач.
   */
  function executeSimulationRun(strategyId, selectedDifficulties, selectedTasks, runNumber) {
    const taskResults = [];
    const journalSteps = [];
    let globalStepIndex = 1;

    selectedTasks.forEach(function (task) {
      const taskResult = simulateTask(task, strategyId);
      taskResults.push(taskResult);

      taskResult.steps.forEach(function (step) {
        journalSteps.push(Object.assign({}, step, {
          globalIndex: globalStepIndex++
        }));
      });
    });

    // Расчёт агрегированных метрик по задачам и по шагам журнала
    const totalTasks = taskResults.length;
    const succeededTasks = taskResults.filter(function (r) { return r.success; }).length;
    const failedTasks = totalTasks - succeededTasks;
    const successRate = totalTasks > 0 ? (succeededTasks / totalTasks) * 100 : 0;

    // Суммы по журналу шагов
    let totalCostFromSteps = 0;
    let totalLatencyFromSteps = 0;
    let totalStepsFromJournal = 0;

    const stepTypeCounts = { plan: 0, answer: 0, verify: 0, fix: 0 };
    const stepTypeCosts = { plan: 0, answer: 0, verify: 0, fix: 0 };
    const stepTypeLatencies = { plan: 0, answer: 0, verify: 0, fix: 0 };

    journalSteps.forEach(function (st) {
      totalCostFromSteps += st.cost;
      totalLatencyFromSteps += st.latencyMs;
      totalStepsFromJournal += st.stepsContribution;

      stepTypeCounts[st.type] += 1;
      stepTypeCosts[st.type] += st.cost;
      stepTypeLatencies[st.type] += st.latencyMs;
    });

    // Суммы по строкам таблицы задач (для сверки)
    let totalCostFromTasks = 0;
    let totalLatencyFromTasks = 0;
    let totalStepsFromTasks = 0;

    taskResults.forEach(function (tr) {
      totalCostFromTasks += tr.cost;
      totalLatencyFromTasks += tr.latencyMs;
      totalStepsFromTasks += tr.stepCount;
    });

    const isConsistent =
      totalCostFromSteps === totalCostFromTasks &&
      totalLatencyFromSteps === totalLatencyFromTasks &&
      totalStepsFromJournal === totalStepsFromTasks &&
      totalStepsFromJournal === journalSteps.length;

    const fixedCount = taskResults.filter(function (r) {
      return r.outcomeCategory === "fixed_by_verify";
    }).length;
    const unfixableCount = taskResults.filter(function (r) {
      return r.outcomeCategory === "unfixable_error";
    }).length;
    const fixableUnverifiedCount = taskResults.filter(function (r) {
      return r.outcomeCategory === "fixable_error_unverified";
    }).length;

    const strategyMeta = STRATEGIES[strategyId];
    const taskSetKey = buildTaskSetKey(selectedTasks);
    const taskSetLabel = describeTaskSet(selectedDifficulties, totalTasks);

    return {
      runId: runNumber,
      strategyId: strategyId,
      strategyName: strategyMeta.name,
      strategyShortName: strategyMeta.shortName,
      selectedDifficulties: selectedDifficulties.slice(),
      taskSetKey: taskSetKey,
      taskSetLabel: taskSetLabel,
      configKey: strategyId + "::" + taskSetKey,
      totalTasks: totalTasks,
      succeededTasks: succeededTasks,
      failedTasks: failedTasks,
      successRate: successRate,
      totalCost: totalCostFromSteps,
      totalTokens: totalCostFromSteps * 100,
      avgCostPerTask: totalTasks > 0 ? totalCostFromSteps / totalTasks : 0,
      totalLatencyMs: totalLatencyFromSteps,
      avgLatencyPerTask: totalTasks > 0 ? totalLatencyFromSteps / totalTasks : 0,
      totalSteps: totalStepsFromJournal,
      avgStepsPerTask: totalTasks > 0 ? totalStepsFromJournal / totalTasks : 0,
      stepTypeCounts: stepTypeCounts,
      stepTypeCosts: stepTypeCosts,
      stepTypeLatencies: stepTypeLatencies,
      fixedCount: fixedCount,
      unfixableCount: unfixableCount,
      fixableUnverifiedCount: fixableUnverifiedCount,
      isConsistent: isConsistent,
      taskResults: taskResults,
      journalSteps: journalSteps
    };
  }

  // 6. ОТРИСОВКА ИНТЕРФЕЙСА
  function updateSelectionSummaryUI() {
    const diffs = getSelectedDifficulties();
    const filteredTasks = getFilteredTasks(diffs);
    const summaryEl = document.getElementById("selection-summary");

    const easyCount = filteredTasks.filter(function (t) { return t.difficulty === "easy"; }).length;
    const mediumCount = filteredTasks.filter(function (t) { return t.difficulty === "medium"; }).length;
    const hardCount = filteredTasks.filter(function (t) { return t.difficulty === "hard"; }).length;

    if (filteredTasks.length === 0) {
      summaryEl.innerHTML =
        "Выбрано задач: <strong>0 из " + TASKS.length + "</strong> — набор пуст. Выберите хотя бы один уровень сложности для расчёта.";
    } else {
      summaryEl.innerHTML =
        "Выбрано задач: <strong>" + filteredTasks.length + " из " + TASKS.length + "</strong> " +
        "(Простые: " + easyCount + ", Средние: " + mediumCount + ", Сложные: " + hardCount + ")";
    }

    // Синхронизируем подсветку кнопок пресетов
    const presetButtons = document.querySelectorAll(".btn-preset");
    presetButtons.forEach(function (btn) {
      const preset = btn.getAttribute("data-preset");
      let isActive = false;
      if (preset === "all" && diffs.length === 3) isActive = true;
      if (preset === "none" && diffs.length === 0) isActive = true;
      if (preset === "easy" && diffs.length === 1 && diffs[0] === "easy") isActive = true;
      if (preset === "medium" && diffs.length === 1 && diffs[0] === "medium") isActive = true;
      if (preset === "hard" && diffs.length === 1 && diffs[0] === "hard") isActive = true;
      btn.classList.toggle("active", isActive);
    });

    checkStaleStateUI();
  }

  function checkStaleStateUI() {
    const staleAlert = document.getElementById("stale-alert");
    if (!state.currentRun) {
      staleAlert.classList.add("hidden");
      return;
    }

    const currentKey = getCurrentConfigKey();
    if (currentKey !== state.lastRunConfigKey) {
      staleAlert.textContent =
        "Параметры на панели управления были изменены после последнего запуска. " +
        "Ниже отображаются результаты предыдущего расчёта («" +
        state.currentRun.strategyName + "», выборка: " + state.currentRun.taskSetLabel + "). " +
        "Нажмите «Запустить симуляцию», чтобы выполнить расчёт для новых параметров.";
      staleAlert.classList.remove("hidden");
    } else {
      staleAlert.classList.add("hidden");
    }
  }

  function renderMetricsSection(run) {
    const emptyState = document.getElementById("metrics-empty-state");
    const grid = document.getElementById("metrics-grid");
    const contextSubtitle = document.getElementById("metrics-run-context");
    const consistencyBadge = document.getElementById("consistency-badge");
    const conclusionBox = document.getElementById("dynamic-conclusion");

    if (!run) {
      emptyState.classList.remove("hidden");
      grid.classList.add("hidden");
      consistencyBadge.classList.add("hidden");
      conclusionBox.classList.add("hidden");
      contextSubtitle.textContent =
        "Запуск ещё не выполнялся. Выберите параметры выше и нажмите «Запустить симуляцию».";
      return;
    }

    emptyState.classList.add("hidden");
    grid.classList.remove("hidden");
    conclusionBox.classList.remove("hidden");

    contextSubtitle.innerHTML =
      "Результаты <strong>Запуска №" + run.runId + "</strong> · Стратегия: <strong>«" +
      run.strategyName + "»</strong> · Выборка: <strong>" + run.taskSetLabel + "</strong>";

    if (run.isConsistent) {
      consistencyBadge.classList.remove("hidden");
      consistencyBadge.textContent =
        "Сверка пройдена: карточки метрик = сумма строк таблицы задач = сумма шагов журнала";
    }

    // 1. Успешность
    document.getElementById("metric-success-rate").textContent = formatPercent(run.successRate);
    document.getElementById("metric-success-count").textContent =
      "Решено успешно: " + run.succeededTasks + " из " + run.totalTasks + " задач";

    let successBreakdownText = "Неудач: " + run.failedTasks;
    if (run.fixedCount > 0) {
      successBreakdownText += " · Исправлено проверкой: " + run.fixedCount;
    }
    if (run.unfixableCount > 0) {
      successBreakdownText += " · Неисправимых ошибок: " + run.unfixableCount;
    }
    document.getElementById("metric-success-breakdown").textContent = successBreakdownText;

    // 2. Общая стоимость
    document.getElementById("metric-total-cost").textContent = formatNumber(run.totalCost) + " у.е.";
    document.getElementById("metric-avg-cost").textContent =
      "В среднем: " + run.avgCostPerTask.toFixed(1) + " у.е. / задача (" + formatNumber(run.totalTokens) + " усл. токенов)";
    document.getElementById("metric-cost-breakdown").textContent =
      "План: " + run.stepTypeCosts.plan + " · Ответ: " + run.stepTypeCosts.answer +
      " · Проверка: " + run.stepTypeCosts.verify + " · Исправление: " + run.stepTypeCosts.fix + " у.е.";

    // 3. Общая задержка
    const totalSeconds = (run.totalLatencyMs / 1000).toFixed(2);
    document.getElementById("metric-total-latency").textContent = formatNumber(run.totalLatencyMs) + " мс";
    document.getElementById("metric-avg-latency").textContent =
      "Модельное время: " + totalSeconds + " с (в среднем " + Math.round(run.avgLatencyPerTask) + " мс / задача)";
    document.getElementById("metric-latency-breakdown").textContent =
      "План: " + formatNumber(run.stepTypeLatencies.plan) + " · Ответ: " + formatNumber(run.stepTypeLatencies.answer) +
      " · Проверка: " + formatNumber(run.stepTypeLatencies.verify) + " · Испр.: " + formatNumber(run.stepTypeLatencies.fix) + " мс";

    // 4. Количество шагов
    document.getElementById("metric-total-steps").textContent = formatNumber(run.totalSteps) + " шагов";
    document.getElementById("metric-avg-steps").textContent =
      "В среднем: " + run.avgStepsPerTask.toFixed(2) + " шага / задача";
    document.getElementById("metric-steps-breakdown").textContent =
      "Планов: " + run.stepTypeCounts.plan + " · Ответов: " + run.stepTypeCounts.answer +
      " · Проверок: " + run.stepTypeCounts.verify + " · Исправлений: " + run.stepTypeCounts.fix;

    renderDynamicConclusion(run);
  }

  function renderDynamicConclusion(run) {
    const container = document.getElementById("conclusion-content");
    const paragraphs = [];

    if (run.strategyId === "direct") {
      paragraphs.push(
        "<p><strong>Минимальные затраты ценой низкой надёжности на сложных задачах:</strong> стратегия «Прямой ответ» выполнила ровно по 1 шагу на задачу (всего <strong>" +
        run.totalSteps + " шагов</strong>, <strong>" + formatNumber(run.totalCost) + " у.е.</strong>, <strong>" +
        formatNumber(run.totalLatencyMs) + " мс</strong>), но решила только <strong>" +
        run.succeededTasks + " из " + run.totalTasks + " задач (" + formatPercent(run.successRate) + ")</strong>.</p>"
      );
      paragraphs.push(
        "<p><strong>Когда стратегия оправдана:</strong> подходит для одношаговых типовых операций (классификация, извлечение полей из простых шаблонов) при жёстких ограничениях на задержку и бюджет. На многошаговых задачах отсутствие планирования и валидации приводит к систематическим сбоям.</p>"
      );
    } else if (run.strategyId === "plan_answer") {
      paragraphs.push(
        "<p><strong>Промежуточный компромисс (планирование устраняет структурные сбои, но не ловит мелкие дефекты):</strong> за счёт предварительного шага планирования успешность составила <strong>" +
        formatPercent(run.successRate) + " (" + run.succeededTasks + " из " + run.totalTasks + " задач)</strong> при затратах <strong>" +
        run.totalSteps + " шагов</strong>, <strong>" + formatNumber(run.totalCost) + " у.е.</strong> и <strong>" +
        formatNumber(run.totalLatencyMs) + " мс</strong>.</p>"
      );
      if (run.fixableUnverifiedCount > 0) {
        paragraphs.push(
          "<p><strong>Потенциал для самопроверки:</strong> в выборке осталось <strong>" +
          run.fixableUnverifiedCount + " задач с исправимыми ошибками</strong> (граничные операторы, синтаксис JSON, контрольные суммы), где план был верным, но без шага валидации дефект ответа остался незамеченным.</p>"
        );
      }
    } else if (run.strategyId === "plan_verify") {
      paragraphs.push(
        "<p><strong>Максимальное качество решения за счёт дополнительных вычислительных ресурсов:</strong> стратегия «Планирование, ответ и проверка» достигла успешности <strong>" +
        formatPercent(run.successRate) + " (" + run.succeededTasks + " из " + run.totalTasks + " задач)</strong>. Шаг проверки обнаружил и позволил исправить <strong>" +
        run.fixedCount + " исправимых ошибок</strong>, однако потребовал <strong>" +
        run.totalSteps + " шагов</strong>, <strong>" + formatNumber(run.totalCost) + " у.е.</strong> и <strong>" +
        formatNumber(run.totalLatencyMs) + " мс</strong>.</p>"
      );
      if (run.unfixableCount > 0) {
        paragraphs.push(
          "<p><strong>Граница возможностей самопроверки:</strong> даже самая полная стратегия не дала 100% результата — <strong>" +
          run.unfixableCount + " задачи с неисправимыми ошибками</strong> остались нерешёнными (отсутствие доступа к внешней системе или внутренне противоречивое ТЗ). Ни одна стратегия не является универсально лучшей: выбор зависит от цены ошибки и допустимой задержки.</p>"
        );
      } else {
        paragraphs.push(
          "<p><strong>Инженерный вывод:</strong> на данной выборке проверка исправила все встретившиеся ошибки, но для простых задач шаги планирования и проверки стали чистыми накладными расходами.</p>"
        );
      }
    }

    container.innerHTML = paragraphs.join("");
  }

  function renderTasksTable(run) {
    const emptyState = document.getElementById("tasks-empty-state");
    const tableContainer = document.getElementById("tasks-table-container");
    const tbody = document.getElementById("tasks-results-tbody");
    const tfoot = document.getElementById("tasks-results-tfoot");

    if (!run) {
      emptyState.classList.remove("hidden");
      tableContainer.classList.add("hidden");
      tbody.innerHTML = "";
      tfoot.innerHTML = "";
      return;
    }

    emptyState.classList.add("hidden");
    tableContainer.classList.remove("hidden");

    const rowsHtml = run.taskResults.map(function (tr) {
      const outcomeBadgeClass = tr.success ? "badge-success" : "badge-fail";
      const stepPillsHtml = tr.steps.map(function (st) {
        return '<span class="step-pill ' + st.pillClass + '">' + st.shortLabel + "</span>";
      }).join(' <span aria-hidden="true">→</span> ');

      return (
        "<tr>" +
          "<td>" +
            '<div class="task-code">' + tr.taskId + "</div>" +
            '<div class="task-title-cell">' + tr.title + "</div>" +
          "</td>" +
          "<td>" +
            '<span class="badge ' + tr.difficultyBadgeClass + '">' +
              tr.difficultyLabel + " (K=" + tr.multiplier + ")" +
            "</span>" +
          "</td>" +
          "<td>" +
            '<span class="badge ' + outcomeBadgeClass + '">' + tr.outcomeBadgeText + "</span>" +
            '<div class="task-Diagnostic-note">' + tr.diagnosticSummary + "</div>" +
          "</td>" +
          '<td><div class="step-chain">' + stepPillsHtml + "</div></td>" +
          '<td class="num-col"><strong>' + tr.stepCount + "</strong></td>" +
          '<td class="num-col"><strong>' + formatNumber(tr.cost) + " у.е.</strong></td>" +
          '<td class="num-col"><strong>' + formatNumber(tr.latencyMs) + " мс</strong></td>" +
          "<td>" +
            '<button type="button" class="btn btn-secondary btn-sm btn-filter-task-log" data-task-id="' + tr.taskId + '">' +
              "Шаги задачи" +
            "</button>" +
          "</td>" +
        "</tr>"
      );
    }).join("");

    tbody.innerHTML = rowsHtml;

    tfoot.innerHTML =
      "<tr>" +
        '<td colspan="2">Итого по таблице задач (' + run.totalTasks + " зад.):</td>" +
        "<td>Успешно: " + run.succeededTasks + " из " + run.totalTasks + " (" + formatPercent(run.successRate) + ")</td>" +
        "<td>Сверка с карточками метрик: совпадает</td>" +
        '<td class="num-col">' + formatNumber(run.totalSteps) + " шагов</td>" +
        '<td class="num-col">' + formatNumber(run.totalCost) + " у.е.</td>" +
        '<td class="num-col">' + formatNumber(run.totalLatencyMs) + " мс</td>" +
        "<td></td>" +
      "</tr>";
  }

  function populateJournalTaskSelect(run) {
    const select = document.getElementById("journal-task-filter");
    if (!run) {
      select.innerHTML = '<option value="all">Все задачи запуска</option>';
      return;
    }

    const options = ['<option value="all">Все задачи запуска (' + run.totalTasks + ')</option>'];
    run.taskResults.forEach(function (tr) {
      options.push(
        '<option value="' + tr.taskId + '">' + tr.taskId + " — " + tr.title + "</option>"
      );
    });
    select.innerHTML = options.join("");
  }

  function renderJournalTable(run) {
    const emptyState = document.getElementById("journal-empty-state");
    const container = document.getElementById("journal-container");
    const tbody = document.getElementById("journal-tbody");
    const tfoot = document.getElementById("journal-tfoot");

    if (!run) {
      emptyState.classList.remove("hidden");
      container.classList.add("hidden");
      tbody.innerHTML = "";
      tfoot.innerHTML = "";
      return;
    }

    emptyState.classList.add("hidden");
    container.classList.remove("hidden");

    const taskFilter = document.getElementById("journal-task-filter").value;
    const stepFilter = document.getElementById("journal-step-filter").value;

    const filteredSteps = run.journalSteps.filter(function (st) {
      const matchTask = taskFilter === "all" || st.taskId === taskFilter;
      const matchStep = stepFilter === "all" || st.type === stepFilter;
      return matchTask && matchStep;
    });

    let filteredStepsCount = 0;
    let filteredCost = 0;
    let filteredLatency = 0;

    const rowsHtml = filteredSteps.map(function (st) {
      filteredStepsCount += st.stepsContribution;
      filteredCost += st.cost;
      filteredLatency += st.latencyMs;

      return (
        "<tr>" +
          '<td class="num-col">#' + st.globalIndex + "</td>" +
          "<td>" +
            '<span class="task-code">' + st.taskId + "</span> " +
            '<span class="badge badge-neutral">K=' + st.multiplier + "</span>" +
          "</td>" +
          '<td><span class="step-pill ' + st.pillClass + '">' + st.typeLabel + "</span></td>" +
          "<td>" +
            "<div><strong>" + st.statusLabel + ":</strong> " + st.actionText + "</div>" +
          "</td>" +
          '<td class="num-col">+' + st.stepsContribution + "</td>" +
          '<td class="num-col">+' + st.cost + " у.е.</td>" +
          '<td class="num-col">+' + formatNumber(st.latencyMs) + " мс</td>" +
        "</tr>"
      );
    }).join("");

    if (filteredSteps.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center; padding: 20px;">По выбранному фильтру шагов не найдено. В этой стратегии данный тип операции не выполнялся.</td></tr>';
    } else {
      tbody.innerHTML = rowsHtml;
    }

    const isFiltered = taskFilter !== "all" || stepFilter !== "all";
    let footerHtml = "";

    if (isFiltered) {
      footerHtml +=
        "<tr>" +
          '<td colspan="4">Сумма по выбранному фильтру журнала:</td>' +
          '<td class="num-col">' + formatNumber(filteredStepsCount) + " шагов</td>" +
          '<td class="num-col">' + formatNumber(filteredCost) + " у.е.</td>" +
          '<td class="num-col">' + formatNumber(filteredLatency) + " мс</td>" +
        "</tr>";
    }

    footerHtml +=
      "<tr>" +
        '<td colspan="4">Итого по всему запуску (совпадает с карточками метрик):</td>' +
        '<td class="num-col">' + formatNumber(run.totalSteps) + " шагов</td>" +
        '<td class="num-col">' + formatNumber(run.totalCost) + " у.е.</td>" +
        '<td class="num-col">' + formatNumber(run.totalLatencyMs) + " мс</td>" +
      "</tr>";

    tfoot.innerHTML = footerHtml;
  }

  // 7. СРАВНЕНИЕ ДВУХ ЗАПУСКОВ
  function updateComparisonSelectors() {
    const emptyState = document.getElementById("comparison-empty-state");
    const emptyText = document.getElementById("comparison-empty-text");
    const content = document.getElementById("comparison-content");
    const selectA = document.getElementById("compare-run-a");
    const selectB = document.getElementById("compare-run-b");

    if (state.runHistory.length < 2) {
      emptyState.classList.remove("hidden");
      content.classList.add("hidden");

      if (state.runHistory.length === 0) {
        emptyText.innerHTML =
          "Сейчас в истории сохранено <strong>0 запусков</strong>. Чтобы сравнить стратегии, выполните сначала один запуск " +
          "(например, «Планирование и ответ»), затем выберите другую стратегию на том же наборе задач (например, " +
          "«Планирование, ответ и проверка») и нажмите «Запустить симуляцию» второй раз.";
      } else {
        const firstRun = state.runHistory[0];
        emptyText.innerHTML =
          "Выполнен <strong>1 запуск</strong> («" + firstRun.strategyName + "», выборка: " + firstRun.taskSetLabel + "). " +
          "Для сравнения необходим минимум второй запуск: выберите другую стратегию в панели управления и нажмите <strong>«Запустить симуляцию»</strong>.";
      }
      return;
    }

    emptyState.classList.add("hidden");
    content.classList.remove("hidden");

    const optionsHtml = state.runHistory.map(function (r) {
      return (
        '<option value="' + r.runId + '">' +
          "Запуск №" + r.runId + ": " + r.strategyName + " [" + r.taskSetLabel + "] — " +
          formatPercent(r.successRate) + ", " + r.totalCost + " у.е." +
        "</option>"
      );
    }).join("");

    selectA.innerHTML = optionsHtml;
    selectB.innerHTML = optionsHtml;

    // По умолчанию сравниваем предпоследний запуск (А) и последний запуск (Б)
    const prevRun = state.runHistory[state.runHistory.length - 2];
    const lastRun = state.runHistory[state.runHistory.length - 1];
    selectA.value = String(prevRun.runId);
    selectB.value = String(lastRun.runId);

    renderComparisonDetails();
  }

  function findRunById(runId) {
    return state.runHistory.find(function (r) {
      return r.runId === Number(runId);
    });
  }

  function formatSignedNumber(val, suffix) {
    const sign = val > 0 ? "+" : "";
    return sign + formatNumber(val) + (suffix ? " " + suffix : "");
  }

  function formatSignedPercentChange(oldVal, newVal) {
    if (oldVal === 0) return "н/д";
    const rel = ((newVal - oldVal) / oldVal) * 100;
    const sign = rel > 0 ? "+" : "";
    return sign + rel.toFixed(1) + "%";
  }

  function renderComparisonDetails() {
    const selectA = document.getElementById("compare-run-a");
    const selectB = document.getElementById("compare-run-b");
    const runA = findRunById(selectA.value);
    const runB = findRunById(selectB.value);

    if (!runA || !runB) return;

    const statusBanner = document.getElementById("comparison-taskset-status");
    const sameTaskSet = runA.taskSetKey === runB.taskSetKey;

    if (sameTaskSet) {
      statusBanner.className = "alert alert-success";
      statusBanner.innerHTML =
        "<strong>Корректное сравнение на одинаковом наборе задач:</strong> оба запуска выполнены на выборке <strong>«" +
        runA.taskSetLabel + "»</strong>. Все изменения метрик обусловлены исключительно разницей между стратегиями " +
        "«" + runA.strategyName + "» (Запуск №" + runA.runId + ") и «" + runB.strategyName + "» (Запуск №" + runB.runId + ").";
    } else {
      statusBanner.className = "alert alert-warning";
      statusBanner.innerHTML =
        "<strong>Внимание — наборы задач различаются!</strong> Запуск №" + runA.runId + " выполнен на выборке «" +
        runA.taskSetLabel + "», а Запуск №" + runB.runId + " — на выборке «" + runB.taskSetLabel + "». " +
        "Прямое сопоставление суммарной стоимости, задержки и количества шагов некорректно. Для честного сравнения выберите запуски с одинаковым набором задач.";
    }

    // Расчёт дельт (Запуск Б относительно Запуска А)
    const diffSuccessRate = runB.successRate - runA.successRate;
    const diffSucceededTasks = runB.succeededTasks - runA.succeededTasks;
    const diffCost = runB.totalCost - runA.totalCost;
    const diffLatency = runB.totalLatencyMs - runA.totalLatencyMs;
    const diffSteps = runB.totalSteps - runA.totalSteps;

    // 1. Карточка сравнения успешности
    let successBadgeClass = "delta-neutral";
    let successDirectionText = "Без изменений: доля решённых задач осталась прежней.";
    if (diffSuccessRate > 0.001) {
      successBadgeClass = "delta-quality-up";
      successDirectionText = "Улучшение качества: решено на " + diffSucceededTasks + " зад. больше (рост успешности).";
    } else if (diffSuccessRate < -0.001) {
      successBadgeClass = "delta-quality-down";
      successDirectionText = "Снижение качества: решено на " + Math.abs(diffSucceededTasks) + " зад. меньше (потеря точности).";
    }

    // 2. Карточка сравнения стоимости
    let costBadgeClass = "delta-neutral";
    let costDirectionText = "Без изменений: стоимость выполнения не изменилась.";
    if (diffCost > 0) {
      costBadgeClass = "delta-cost-up";
      costDirectionText = "Рост вычислительных затрат: плата за дополнительные шаги агента.";
    } else if (diffCost < 0) {
      costBadgeClass = "delta-cost-down";
      costDirectionText = "Экономия бюджета: сокращение числа или стоимости операций.";
    }

    // 3. Карточка сравнения задержки
    let latencyBadgeClass = "delta-neutral";
    let latencyDirectionText = "Без изменений: суммарное время ответа прежнее.";
    if (diffLatency > 0) {
      latencyBadgeClass = "delta-cost-up";
      latencyDirectionText = "Увеличение времени ожидания: плата за последовательные шаги рассуждений и проверки.";
    } else if (diffLatency < 0) {
      latencyBadgeClass = "delta-cost-down";
      latencyDirectionText = "Ускорение ответа: меньшее время ожидания результата.";
    }

    // 4. Карточка сравнения шагов
    let stepsBadgeClass = "delta-neutral";
    let stepsDirectionText = "Без изменений: одинаковое количество операций.";
    if (diffSteps > 0) {
      stepsBadgeClass = "delta-cost-up";
      stepsDirectionText = "Рост числа операций: добавлены шаги планирования, проверки или исправления.";
    } else if (diffSteps < 0) {
      stepsBadgeClass = "delta-cost-down";
      stepsDirectionText = "Сокращение цепочки: меньше вызовов модели.";
    }

    const signPP = diffSuccessRate > 0 ? "+" : "";
    const grid = document.getElementById("comparison-grid");
    grid.innerHTML =
      // Успешность
      '<article class="compare-card">' +
        '<div class="compare-card-title">Успешность (А → Б)</div>' +
        '<div class="compare-values-row">' +
          '<span class="compare-val-old">' + formatPercent(runA.successRate) + "</span>" +
          '<span class="compare-arrow">→</span>' +
          '<span class="compare-val-new">' + formatPercent(runB.successRate) + "</span>" +
        "</div>" +
        '<div><span class="compare-delta-badge ' + successBadgeClass + '">' +
          signPP + diffSuccessRate.toFixed(1) + " п.п. (" + formatSignedNumber(diffSucceededTasks, "зад.") + ")" +
        "</span></div>" +
        '<div class="compare-explanation">' + successDirectionText + "</div>" +
      "</article>" +

      // Стоимость
      '<article class="compare-card">' +
        '<div class="compare-card-title">Общая стоимость (А → Б)</div>' +
        '<div class="compare-values-row">' +
          '<span class="compare-val-old">' + formatNumber(runA.totalCost) + " у.е.</span>" +
          '<span class="compare-arrow">→</span>' +
          '<span class="compare-val-new">' + formatNumber(runB.totalCost) + " у.е.</span>" +
        "</div>" +
        '<div><span class="compare-delta-badge ' + costBadgeClass + '">' +
          formatSignedNumber(diffCost, "у.е.") + " (" + formatSignedPercentChange(runA.totalCost, runB.totalCost) + ")" +
        "</span></div>" +
        '<div class="compare-explanation">' + costDirectionText + "</div>" +
      "</article>" +

      // Задержка
      '<article class="compare-card">' +
        '<div class="compare-card-title">Общая задержка (А → Б)</div>' +
        '<div class="compare-values-row">' +
          '<span class="compare-val-old">' + formatNumber(runA.totalLatencyMs) + " мс</span>" +
          '<span class="compare-arrow">→</span>' +
          '<span class="compare-val-new">' + formatNumber(runB.totalLatencyMs) + " мс</span>" +
        "</div>" +
        '<div><span class="compare-delta-badge ' + latencyBadgeClass + '">' +
          formatSignedNumber(diffLatency, "мс") + " (" + formatSignedPercentChange(runA.totalLatencyMs, runB.totalLatencyMs) + ")" +
        "</span></div>" +
        '<div class="compare-explanation">' + latencyDirectionText + "</div>" +
      "</article>" +

      // Шаги
      '<article class="compare-card">' +
        '<div class="compare-card-title">Количество шагов (А → Б)</div>' +
        '<div class="compare-values-row">' +
          '<span class="compare-val-old">' + formatNumber(runA.totalSteps) + "</span>" +
          '<span class="compare-arrow">→</span>' +
          '<span class="compare-val-new">' + formatNumber(runB.totalSteps) + "</span>" +
        "</div>" +
        '<div><span class="compare-delta-badge ' + stepsBadgeClass + '">' +
          formatSignedNumber(diffSteps, "шагов") + " (" + formatSignedPercentChange(runA.totalSteps, runB.totalSteps) + ")" +
        "</span></div>" +
        '<div class="compare-explanation">' + stepsDirectionText + "</div>" +
      "</article>";

    // Позадачное сравнение (если наборы задач совпадают)
    const tasksWrapper = document.getElementById("comparison-tasks-wrapper");
    const tasksTbody = document.getElementById("comparison-tasks-tbody");

    if (!sameTaskSet) {
      tasksWrapper.classList.add("hidden");
      tasksTbody.innerHTML = "";
      return;
    }

    tasksWrapper.classList.remove("hidden");
    const rows = runA.taskResults.map(function (trA, idx) {
      const trB = runB.taskResults[idx];
      const dSteps = trB.stepCount - trA.stepCount;
      const dCost = trB.cost - trA.cost;
      const dLat = trB.latencyMs - trA.latencyMs;

      let effectText = "";
      if (!trA.success && trB.success) {
        effectText = "Исправлена ошибка: дополнительные шаги привели к верному решению.";
      } else if (trA.success && !trB.success) {
        effectText = "Потеря верного решения при упрощении стратегии.";
      } else if (trA.success && trB.success) {
        if (dCost > 0) {
          effectText = "Задача уже решалась верно: дополнительные шаги (+ " + dCost + " у.е.) стали накладным расходом.";
        } else if (dCost < 0) {
          effectText = "Экономия ресурсов без потери правильности ответа.";
        } else {
          effectText = "Без изменений.";
        }
      } else {
        // Оба неудача
        if (trB.outcomeCategory === "unfixable_error") {
          effectText = "Неисправимая ошибка осталась: проверка не может устранить фундаментальное ограничение.";
        } else {
          effectText = "Ошибка сохранилась в обоих запусках.";
        }
      }

      return (
        "<tr>" +
          "<td><span class='task-code'>" + trA.taskId + "</span> " + trA.title + "</td>" +
          "<td><span class='badge " + trA.difficultyBadgeClass + "'>" + trA.difficultyLabel + " (K=" + trA.multiplier + ")</span></td>" +
          "<td><span class='badge " + (trA.success ? "badge-success" : "badge-fail") + "'>" + trA.outcomeBadgeText + "</span></td>" +
          "<td><span class='badge " + (trB.success ? "badge-success" : "badge-fail") + "'>" + trB.outcomeBadgeText + "</span></td>" +
          '<td class="num-col">' + formatSignedNumber(dSteps, "") + "</td>" +
          '<td class="num-col">' + formatSignedNumber(dCost, "у.е.") + "</td>" +
          '<td class="num-col">' + formatSignedNumber(dLat, "мс") + "</td>" +
          "<td>" + effectText + "</td>" +
        "</tr>"
      );
    }).join("");

    tasksTbody.innerHTML = rows;
  }

  // 8. ОТСЛЕЖИВАНИЕ ПРОГРЕССА КОНТРОЛЬНОГО СЦЕНАРИЯ
  function updateScenarioProgressUI() {
    const allTasksKey = buildTaskSetKey(TASKS);
    const hasPlanAnswerAll = state.runHistory.some(function (r) {
      return r.strategyId === "plan_answer" && r.taskSetKey === allTasksKey;
    });
    const hasPlanVerifyAll = state.runHistory.some(function (r) {
      return r.strategyId === "plan_verify" && r.taskSetKey === allTasksKey;
    });
    const bothDone = hasPlanAnswerAll && hasPlanVerifyAll;

    document.getElementById("scen-step-1").classList.toggle("done", hasPlanAnswerAll);
    document.getElementById("scen-step-2").classList.toggle("done", hasPlanVerifyAll);
    document.getElementById("scen-step-3").classList.toggle("done", bothDone);

    let completed = 0;
    if (hasPlanAnswerAll) completed += 1;
    if (hasPlanVerifyAll) completed += 1;
    if (bothDone) completed += 1;

    const badge = document.getElementById("scenario-progress-badge");
    badge.textContent = "Прогресс сценария: " + completed + " / 3";
    badge.className = completed === 3 ? "badge badge-success" : "badge badge-neutral";
  }

  // 9. ОБРАБОТЧИКИ СОБЫТИЙ
  function handleRunSimulation() {
    const validationAlert = document.getElementById("validation-alert");
    const selectedDifficulties = getSelectedDifficulties();
    const selectedTasks = getFilteredTasks(selectedDifficulties);

    // Граничный случай: не выбрано ни одной задачи
    if (selectedTasks.length === 0) {
      validationAlert.textContent =
        "Не выбрано ни одной задачи. Пожалуйста, отметьте хотя бы один уровень сложности («Простая», «Средняя» или «Сложная»), чтобы запустить симуляцию без деления на ноль.";
      validationAlert.classList.remove("hidden");
      return;
    }

    validationAlert.classList.add("hidden");

    const strategyId = getSelectedStrategyId();
    const nextRunNumber = state.runHistory.length + 1;

    // Выполняем расчёт с нуля (старый журнал не прибавляется к новому)
    const runResult = executeSimulationRun(strategyId, selectedDifficulties, selectedTasks, nextRunNumber);

    state.currentRun = runResult;
    state.runHistory.push(runResult);
    state.lastRunConfigKey = runResult.configKey;

    // Обновляем счётчик запусков
    document.getElementById("run-counter-badge").textContent =
      "Выполнено запусков: " + state.runHistory.length;

    // Сбрасываем фильтры журнала к показу всех шагов нового запуска
    populateJournalTaskSelect(runResult);
    document.getElementById("journal-task-filter").value = "all";
    document.getElementById("journal-step-filter").value = "all";

    // Отрисовываем все секции
    checkStaleStateUI();
    renderMetricsSection(runResult);
    renderTasksTable(runResult);
    renderJournalTable(runResult);
    updateComparisonSelectors();
    updateScenarioProgressUI();
  }

  function handleResetAll() {
    // Сброс состояния
    state.runHistory = [];
    state.currentRun = null;
    state.lastRunConfigKey = null;

    // Возврат переключателей к начальному состоянию
    const defaultStrategyRadio = document.getElementById("strategy-plan-answer");
    if (defaultStrategyRadio) defaultStrategyRadio.checked = true;

    const checkboxes = document.querySelectorAll(".difficulty-checkboxes input[type='checkbox']");
    checkboxes.forEach(function (cb) {
      cb.checked = true;
    });

    document.getElementById("validation-alert").classList.add("hidden");
    document.getElementById("stale-alert").classList.add("hidden");
    document.getElementById("run-counter-badge").textContent = "Выполнено запусков: 0";

    updateSelectionSummaryUI();
    renderMetricsSection(null);
    renderTasksTable(null);
    populateJournalTaskSelect(null);
    renderJournalTable(null);
    updateComparisonSelectors();
    updateScenarioProgressUI();
  }

  function applyDifficultyPreset(preset) {
    const checkboxes = document.querySelectorAll(".difficulty-checkboxes input[type='checkbox']");
    checkboxes.forEach(function (cb) {
      if (preset === "all") {
        cb.checked = true;
      } else if (preset === "none") {
        cb.checked = false;
      } else {
        cb.checked = cb.value === preset;
      }
    });
    document.getElementById("validation-alert").classList.add("hidden");
    updateSelectionSummaryUI();
  }

  function initEventListeners() {
    // Кнопки запуска и сброса
    document.getElementById("run-btn").addEventListener("click", handleRunSimulation);
    document.getElementById("reset-btn").addEventListener("click", handleResetAll);

    // Переключение стратегии
    const strategyRadios = document.querySelectorAll('input[name="strategy"]');
    strategyRadios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        checkStaleStateUI();
      });
    });

    // Чекбоксы уровней сложности
    const diffCheckboxes = document.querySelectorAll(".difficulty-checkboxes input[type='checkbox']");
    diffCheckboxes.forEach(function (cb) {
      cb.addEventListener("change", function () {
        document.getElementById("validation-alert").classList.add("hidden");
        updateSelectionSummaryUI();
      });
    });

    // Быстрые пресеты выборки задач
    const presetButtons = document.querySelectorAll(".btn-preset");
    presetButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const preset = btn.getAttribute("data-preset");
        applyDifficultyPreset(preset);
      });
    });

    // Фильтры журнала
    document.getElementById("journal-task-filter").addEventListener("change", function () {
      renderJournalTable(state.currentRun);
    });
    document.getElementById("journal-step-filter").addEventListener("change", function () {
      renderJournalTable(state.currentRun);
    });
    document.getElementById("journal-reset-filter-btn").addEventListener("click", function () {
      document.getElementById("journal-task-filter").value = "all";
      document.getElementById("journal-step-filter").value = "all";
      renderJournalTable(state.currentRun);
    });

    // Клик по кнопке «Шаги задачи» в таблице задач -> фильтрация журнала и прокрутка к нему
    document.getElementById("tasks-results-tbody").addEventListener("click", function (event) {
      const btn = event.target.closest(".btn-filter-task-log");
      if (!btn || !state.currentRun) return;
      const taskId = btn.getAttribute("data-task-id");
      document.getElementById("journal-task-filter").value = taskId;
      document.getElementById("journal-step-filter").value = "all";
      renderJournalTable(state.currentRun);
      document.getElementById("journal-section").scrollIntoView({ behavior: "smooth" });
    });

    // Селекторы сравнения запусков
    document.getElementById("compare-run-a").addEventListener("change", renderComparisonDetails);
    document.getElementById("compare-run-b").addEventListener("change", renderComparisonDetails);
  }

  // Инициализация при загрузке страницы
  document.addEventListener("DOMContentLoaded", function () {
    updateSelectionSummaryUI();
    initEventListeners();
  });
})();
