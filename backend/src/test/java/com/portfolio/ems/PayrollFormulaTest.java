package com.portfolio.ems;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import java.util.*;
class PayrollFormulaTest{
 @Test void roundsEachDeductionBeforeSumming(){var v=PayrollFormula.calculate(100,1);assertThat(v.get("grossPay")).isEqualTo(101L);assertThat(v.get("totalDeductions")).isEqualTo(12L);assertThat(v.get("netPay")).isEqualTo(89L);}
 @Test void zeroSalaryIsValid(){assertThat(PayrollFormula.calculate(0,0).get("netPay")).isEqualTo(0L);}
 @Test void maximumAmountsStayWithinSafeIntegerRange(){var v=PayrollFormula.calculate(1000000000,1000000000);assertThat(v.get("grossPay")).isEqualTo(2000000000L);assertThat(v.get("netPay")).isEqualTo(1780000000L);}
 @Test void invalidAmountIsRejected(){assertThatThrownBy(()->PayrollFormula.calculate(-1,0)).isInstanceOf(ApiException.class);assertThatThrownBy(()->PayrollFormula.calculate(1000000001,0)).isInstanceOf(ApiException.class);}
}
